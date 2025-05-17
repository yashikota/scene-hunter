import { useEffect, useState } from "react";

interface TimerProps {
  seconds: number;
  onComplete: () => void;
}

export function Timer({ seconds, onComplete }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (timeLeft === 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, onComplete]);

  const radius = 30;
  const stroke = 4;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const progress = ((seconds - timeLeft) / seconds) * circumference;

  return (
    <div className="absolute top-4 right-4 w-16 h-16">
      <svg height={radius * 2} width={radius * 2}>
        <circle
          stroke="#ccc"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke="#3b82f6"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - progress}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          transform={`rotate(-90 ${radius} ${radius})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dy="0.3em"
          fontSize="14"
          fontWeight="bold"
          fill="black"
        >
          {timeLeft}
        </text>
      </svg>
    </div>
  );
}





// import { useEffect, useRef, useState } from "react";
// import { motion } from "framer-motion";

// interface TimerProps {
//   seconds: number;
//   onComplete?: () => void;
// }

// export function Timer({ seconds, onComplete }: TimerProps) {
//   const [time, setTime] = useState(seconds);
//   const radius = 40;
//   const stroke = 6;
//   const normalizedRadius = radius - stroke * 0.5;
//   const circumference = normalizedRadius * 2 * Math.PI;
//   const timerRef = useRef<NodeJS.Timeout | null>(null);

//   // 色を緑から赤に変化
//   const getColor = (t: number) => {
//     const ratio = t / seconds;
//     const r = Math.round(255 * (1 - ratio));
//     const g = Math.round(200 * ratio);
//     return `rgb(${r},${g},0)`;
//   };

//   useEffect(() => {
//     if (time === 0) {
//       onComplete?.();
//       return;
//     }

//     timerRef.current = setTimeout(() => {
//       setTime((prev) => prev - 1);
//     }, 1000);

//     return () => {
//       if (timerRef.current) clearTimeout(timerRef.current);
//     };
//   }, [time]);

//   const progress = (seconds - time) / seconds;
//   const dashOffset = circumference * (1 - progress);

  

// //   return (
// //     <div className="absolute top-4 right-4 w-24 h-24">
// //       <svg width={radius * 2} height={radius * 2}>
// //         <circle
// //           stroke="#e5e7eb"
// //           fill="transparent"
// //           strokeWidth={stroke}
// //           r={normalizedRadius}
// //           cx={radius}
// //           cy={radius}
// //         />
// //         <motion.circle
// //           stroke={getColor(time)}
// //           fill="transparent"
// //           strokeWidth={stroke}
// //           strokeDasharray={circumference}
// //           strokeDashoffset={dashOffset}
// //           strokeLinecap="round"
// //           r={normalizedRadius}
// //           cx={radius}
// //           cy={radius}
// //           initial={{ strokeDashoffset: circumference }}
// //           animate={{ strokeDashoffset: dashOffset }}
// //           transition={{ duration: 0.8, ease: "easeOut" }}
// //         />
// //       </svg>
// //       <div className="absolute inset-0 flex items-center justify-center">
// //         <span className="text-black text-xl font-bold">{time}</span>
// //       </div>
// //     </div>
// //   );
// return (
//     <div className="absolute top-2 right-2 w-16 h-16 sm:top-4 sm:right-4 sm:w-20 sm:h-20">
//       <svg width={radius * 2} height={radius * 2}>
//         <circle
//           stroke="#e5e7eb"
//           fill="transparent"
//           strokeWidth={stroke}
//           r={normalizedRadius}
//           cx={radius}
//           cy={radius}
//         />
//         <motion.circle
//           stroke={getColor(time)}
//           fill="transparent"
//           strokeWidth={stroke}
//           strokeDasharray={circumference}
//           strokeDashoffset={dashOffset}
//           strokeLinecap="round"
//           r={normalizedRadius}
//           cx={radius}
//           cy={radius}
//           initial={{ strokeDashoffset: circumference }}
//           animate={{ strokeDashoffset: dashOffset }}
//           transition={{ duration: 0.8, ease: "easeOut" }}
//         />
//       </svg>
//       <div className="absolute inset-0 flex items-center justify-center">
//         <span className="text-black text-lg sm:text-xl font-bold leading-none">
//           {time}
//         </span>
//       </div>
//     </div>
//   );
// }
