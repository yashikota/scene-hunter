import React, { useEffect } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  roomId: z.string().length(6).regex(/^\d{6}$/, "6桁の数字で入力してください"),
  playerName: z.string().min(1, "プレイヤー名は必須です").max(12, "12文字以内で入力してください"),
});

type FormData = z.infer<typeof schema>;

export default function JoinRoom() {
  const navigate = useNavigate();

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Pacifico&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    console.log("参加申請データ", data);
    navigate("/gameroom");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#D0E2F3] text-black">
      <h1
        className="text-4xl text-gray-800 mb-6"
        style={{ fontFamily: '"Pacifico", cursive' }}
      >
        Scene Hunter
      </h1>

      <input
        type="text"
        {...register("roomId")}
        placeholder="ルームIDを入力"
        maxLength={6}
        inputMode="numeric"
        pattern="\d*"
        className="border rounded-xl px-4 py-2 mb-1 w-64 text-center bg-white"
      />
      {errors.roomId && (
        <p className="text-red-600 text-sm mb-3">{errors.roomId.message}</p>
      )}

      <input
        type="text"
        {...register("playerName")}
        placeholder="プレイヤー名を入力"
        className="border rounded-xl px-4 py-2 mb-1 w-64 text-center bg-white"
      />
      {errors.playerName && (
        <p className="text-red-600 text-sm mb-3">{errors.playerName.message}</p>
      )}

      <button
        onClick={handleSubmit(onSubmit)}
        className="px-6 py-3 bg-[#F6B26B] text-black rounded-2xl shadow hover:bg-[#e5a15b] transition"
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
