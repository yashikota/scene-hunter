import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { optimizeImage } from "wasm-image-optimization";
import { z } from "zod";

type Bindings = {
  SCENE_HUNTER_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// サポートされる画像形式
const SUPPORTED_FORMATS = ["jpeg", "png", "webp", "avif"] as const;

// デフォルトの画像サイズ
const DEFAULT_WIDTH = 1280;

// バリデーションスキーマ
const imageFormSchema = z.object({
  image: z.instanceof(File, { message: "画像ファイルが必要です" }),
  w: z.coerce.number().optional(),
  h: z.coerce.number().optional(),
  q: z.coerce.number().optional(),
  f: z.enum(SUPPORTED_FORMATS).optional(),
  filename: z
    .string({ required_error: "ファイル名が必要です" })
    .min(1, { message: "ファイル名は空にできません" }),
});

// アップロードレスポンスの型
interface ImageUploadResponse {
  path: string;
}

app.use("*", cors());
app.use("*", requestId());
app.use("*", logger());

app.onError((err, c) => {
  if (err instanceof z.ZodError) {
    const errors = err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    return c.json({ errors }, 400);
  }
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// ファイルアップロード
const uploadEndpoint = app.post(
  "/upload",
  zValidator("form", imageFormSchema),
  async (c) => {
    try {
      const formData = await c.req.formData();
      const imageFile = formData.get("image") as File | null;
      const filename = formData.get("filename");

      if (!imageFile || !(imageFile instanceof File)) {
        return c.json({ error: "画像ファイルが必要です" }, 400);
      }
      if (!filename || typeof filename !== "string") {
        return c.json({ error: "ファイル名が必要です" }, 400);
      }

      // バリデーション
      if (!imageFile.type.startsWith("image/")) {
        return c.json(
          { error: "無効なファイル形式です。画像ファイルを送信してください" },
          400,
        );
      }

      // パラメータ取得
      const width = formData.get("w")
        ? Number(formData.get("w"))
        : DEFAULT_WIDTH;
      const quality = formData.get("q") ? Number(formData.get("q")) : 75;
      const format =
        (formData.get("f") as "jpeg" | "png" | "webp" | "avif" | null) ||
        "jpeg";

      // サポートされていない画像形式をチェック
      const allowedContentTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
      ];
      if (!imageFile.type || !allowedContentTypes.includes(imageFile.type)) {
        return c.json(
          {
            error: `サポートされている画像形式は ${SUPPORTED_FORMATS.join(", ")} のみです`,
          },
          400,
        );
      }

      // 画像を最適化
      const optimizedImage = await optimizeImage({
        image: await imageFile.arrayBuffer(),
        width,
        quality,
        format,
        speed: 9,
      });

      // 最適化に失敗した場合
      if (!optimizedImage) {
        return c.json({ error: "画像の最適化に失敗しました" }, 500);
      }

      // R2バケットに保存
      const bucket = c.env.SCENE_HUNTER_BUCKET;
      try {
        await bucket.put(filename, optimizedImage.buffer);
      } catch (error) {
        console.error("Error uploading file:", error);
        return c.json(
          { error: "ファイルのアップロード中にエラーが発生しました" },
          500,
        );
      }

      const response: ImageUploadResponse = {
        path: filename,
      };

      return c.json(response);
    } catch (error) {
      console.error("File upload error:", error);
      return c.json({ error: "画像処理中にエラーが発生しました" }, 500);
    }
  },
);

// ファイル削除
const deleteFileEndpoint = app.delete("/file/*", async (c) => {
  try {
    const bucket = c.env.SCENE_HUNTER_BUCKET;
    const path = c.req.path.replace("/file/", "");

    // ファイルが存在するか確認
    const object = await bucket.head(path);
    if (!object) {
      return c.json({ error: "ファイルが見つかりません" }, 404);
    }

    // ファイルを削除
    await bucket.delete(path);

    return c.json({ message: "ファイルを削除しました" }, 200);
  } catch (error) {
    console.error("File deletion error:", error);
    return c.json({ error: "ファイル削除中にエラーが発生しました" }, 500);
  }
});

// バケット削除
const deleteBucketEndpoint = app.delete("/bucket/*", async (c) => {
  try {
    const bucketPrefix = c.req.path.replace("/bucket/", "");
    const bucket = c.env.SCENE_HUNTER_BUCKET;

    // プレフィックスに一致するオブジェクトを一覧
    const objects = await bucket.list({
      prefix: `${bucketPrefix}/`,
    });

    if (objects.objects.length === 0) {
      return c.json({ error: "指定されたバケットが空か存在しません" }, 404);
    }

    // 全てのオブジェクトを削除
    const deletePromises = objects.objects.map((obj) => bucket.delete(obj.key));
    await Promise.all(deletePromises);

    return c.json(
      { message: `${bucketPrefix} バケット内のファイルを全て削除しました` },
      200,
    );
  } catch (error) {
    console.error("Bucket deletion error:", error);
    return c.json({ error: "バケット削除中にエラーが発生しました" }, 500);
  }
});

// ファイル一覧
const listFilesEndpoint = app.get("/list", async (c) => {
  const bucket = c.env.SCENE_HUNTER_BUCKET;
  const options: R2ListOptions = {};
  const objects = await bucket.list(options);
  return c.json(objects);
});

// ファイル取得
const getFileEndpoint = app.get("/file/*", async (c) => {
  try {
    const path = c.req.path.replace("/file/", "");
    const bucket = c.env.SCENE_HUNTER_BUCKET;
    const file = await bucket.get(path);

    // ファイルが見つからない場合
    if (!file) {
      return c.json({ error: "ファイルが見つかりません" }, 404);
    }

    return new Response(await file.arrayBuffer(), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${path.split("/").pop()}"`,
      },
    });
  } catch (error) {
    console.error("File fetch error:", error);
    return c.json({ error: "ファイル取得中にエラーが発生しました" }, 500);
  }
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// RPC
export type uploadEndpoint = typeof uploadEndpoint;
export type deleteFileEndpoint = typeof deleteFileEndpoint;
export type deleteBucketEndpoint = typeof deleteBucketEndpoint;
export type listFilesEndpoint = typeof listFilesEndpoint;
export type getFileEndpoint = typeof getFileEndpoint;

export default app;
