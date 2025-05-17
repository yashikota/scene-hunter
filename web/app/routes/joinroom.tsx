import React from "react";
import { useNavigate } from "react-router"; // react-routerからimport
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  roomId: z.string()
    .length(6, "ルームIDは6桁の数字で入力してください")
    .regex(/^\d{6}$/, "ルームIDは数字6桁である必要があります"),
  playerName: z.string()
    .min(1, "プレイヤー名は必須です")
    .max(12, "プレイヤー名は12文字以内で入力してください"),
});

type FormData = z.infer<typeof schema>;

export default function JoinRoom() {
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    console.log("参加申請データ", data);
    // TODO: ルーム参加処理
    navigate("/gameroom");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-white text-black">
      <h1 className="text-3xl font-bold mb-6">ルーム参加</h1>

      <input
        type="text"
        {...register("roomId")}
        placeholder="ルームIDを入力"
        className="border rounded-xl px-4 py-2 mb-1 w-64 text-center"
        maxLength={6}
        inputMode="numeric"
        pattern="\d*"
      />
      {errors.roomId && <p className="text-red-600 text-sm mb-3">{errors.roomId.message}</p>}

      <input
        type="text"
        {...register("playerName")}
        placeholder="プレイヤー名を入力"
        className="border rounded-xl px-4 py-2 mb-1 w-64 text-center"
      />
      {errors.playerName && <p className="text-red-600 text-sm mb-3">{errors.playerName.message}</p>}

      <button
        onClick={handleSubmit(onSubmit)}
        className="px-6 py-3 bg-green-500 text-white rounded-2xl shadow hover:bg-green-600 transition"
      >
        参加する
      </button>

      <button
        onClick={() => navigate("/room")}
        className="mt-4 text-blue-700 underline"
      >
        戻る
      </button>
    </div>
  );
}
