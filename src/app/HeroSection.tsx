"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const COLS = 5;
const ROWS = 5;
const CENTER_INDEX = 12; // (row 2, col 2) in a 5x5, 0-indexed

// 25 images in row-major (top-left → bottom-right) order. The inner 3x3
// (positions 6,7,8, 11,12,13, 16,17,18) is the original BHT 9-box, with
// the whiteboard image at the absolute center (position 12). The 16 outer
// positions are the new large-images.
const IMAGES = [
  // Row 0 — outer ring top
  "/images/wall/IMG_1739.webp",
  "/images/wall/IMG_1751.webp",
  "/images/wall/IMG_1755.webp",
  "/images/wall/IMG_1767.webp",
  "/images/wall/IMG_0747.webp",
  // Row 1 — outer, BHT, BHT, BHT, outer
  "/images/wall/IMG_1772.webp",
  "/images/bht/67658e6d5bbf6d25065cae74_IMG_2832__1_.avif",
  "/images/bht/67658e6f7d20eca9f6bf046f_IMG_6431.avif",
  "/images/bht/67658e702ebdb35ccbcb3876_IMG_7831.avif",
  "/images/wall/IMG_0751.webp",
  // Row 2 — outer, BHT, HERO (whiteboard), BHT, outer
  "/images/wall/IMG_1794.webp",
  "/images/bht/67658e7075ea3ce7f7a94474_IMG_7825.avif",
  "/images/bht/682c343a20a8821d212445eb_49b8a28009289bc99847e7803987c40b_IMG_9691.webp",
  "/images/bht/6787b903dfc14c54318e85d1_IMG_2260_1.webp",
  "/images/wall/IMG_1797.webp",
  // Row 3 — outer, BHT, BHT (MIT panel), BHT, outer
  "/images/wall/IMG_1811.webp",
  "/images/bht/682c37725850458f4c325aa7_063c97599b82df3b628f42e9dffc986a_IMG_0344.webp",
  "/images/bht/MIT-Media-Lab-Panel.webp",
  "/images/wall/IMG_2269.webp",
  "/images/wall/IMG_2275.webp",
  // Row 4 — outer ring bottom
  "/images/wall/IMG_3757.webp",
  "/images/wall/IMG_5773.webp",
  "/images/wall/IMG_5778.webp",
  "/images/wall/IMG_6366.webp",
  "/images/wall/IMG_9035.webp",
];

// At progress=0 only the center cell is visible: scale 5 makes a 1/5-wide
// cell fill the whole grid container. At progress=1 the full 5x5 is visible.
const START_SCALE = COLS;

export default function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    let queued = false;

    const update = () => {
      queued = false;
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const stickyRange = sectionRef.current.offsetHeight - vh;
      const p = Math.max(0, Math.min(1, -rect.top / stickyRange));
      setProgress(p);
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Linear, continuous scale interpolation — no phased ease so the zoom
  // feels steady the whole way down.
  const scale = START_SCALE - (START_SCALE - 1) * progress;

  return (
    <section ref={sectionRef} className="relative h-[260vh]">
      <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden bg-zinc-900">
        <div
          className="grid w-full will-change-transform"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            transformOrigin: "50% 50%",
            transform: `scale(${scale})`,
          }}
        >
          {IMAGES.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="relative aspect-square overflow-hidden bg-zinc-800"
            >
              <Image
                src={src}
                alt=""
                fill
                priority={i === CENTER_INDEX}
                sizes="20vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
