import React from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  roomId: z.string().length(6).regex(/^\d{6}$/),
  playerName: z.string().min(1).max(12),
});

type FormData = z.infer<typeof schema>;

export default function JoinRoom() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    console.log("参加申請データ", data);
    navigate("/gameroom");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#D0E2F3] text-black">
      <h1 className="text-4xl font-[Pacifico] mb-6">Scene Hunter</h1>

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
        className="px-6 py-3 bg-[#EEEEEE] text-black rounded-2xl shadow hover:bg-gray-300 transition"
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
