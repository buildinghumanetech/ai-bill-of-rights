"use client";

import Image from "next/image";
import { ReactNode, useEffect, useRef, useState } from "react";

const COLS = 5;
const ROWS = 5;

// 25-image grid laid out so positions 6,7,8 / 11,12,13 / 16,17,18 — the
// inner 3x3 — exactly match the BHT 9-image grid used by HeroSection.
// This means at start scale (5/3), the user sees the same 9-box that
// HeroSection ended on; then as they scroll through articles, the 16
// outer images fade in via the zoom-out.
const IMAGES = [
  // Row 0 — outer
  "/images/wall/IMG_1739.webp",
  "/images/wall/IMG_1751.webp",
  "/images/wall/IMG_1755.webp",
  "/images/wall/IMG_1767.webp",
  "/images/wall/IMG_0747.webp",
  // Row 1 — outer, BHT(0), BHT(1), BHT(2), outer
  "/images/wall/IMG_1772.webp",
  "/images/bht/67658e6d5bbf6d25065cae74_IMG_2832__1_.avif",
  "/images/bht/67658e6f7d20eca9f6bf046f_IMG_6431.avif",
  "/images/bht/67658e702ebdb35ccbcb3876_IMG_7831.avif",
  "/images/wall/IMG_0751.webp",
  // Row 2 — outer, BHT(3), HERO (BHT center), BHT(5), outer
  "/images/wall/IMG_1794.webp",
  "/images/bht/67658e7075ea3ce7f7a94474_IMG_7825.avif",
  "/images/bht/682c343a20a8821d212445eb_49b8a28009289bc99847e7803987c40b_IMG_9691.webp",
  "/images/bht/6787b903dfc14c54318e85d1_IMG_2260_1.webp",
  "/images/wall/IMG_1797.webp",
  // Row 3 — outer, BHT(6), MIT-panel (BHT(7)), BHT(8), outer
  "/images/wall/IMG_1811.webp",
  "/images/bht/682c37725850458f4c325aa7_063c97599b82df3b628f42e9dffc986a_IMG_0344.webp",
  "/images/bht/MIT-Media-Lab-Panel.webp",
  "/images/bht/680a67d1ef8ec2948110caf1_e68ac228385ffdcc0ec44eaca54c6d0e_IMG_0140_1.webp",
  "/images/wall/IMG_2269.webp",
  // Row 4 — outer
  "/images/wall/IMG_2275.webp",
  "/images/wall/IMG_3757.webp",
  "/images/wall/IMG_5773.webp",
  "/images/wall/IMG_5778.webp",
  "/images/wall/IMG_6366.webp",
];

// At start, scale=5/3 ≈ 1.667 — the inner 3x3 fills the viewport exactly.
// At end, scale=1 — the full 5x5 is visible. This continues the zoom-out
// from where HeroSection's 3x3 ended.
const START_SCALE = COLS / 3;

interface Props {
  children: ReactNode;
}

export default function WallBehindArticles({ children }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    let queued = false;

    // Compress the zoom animation into the first ~150vh of scroll within
    // the section so the user sees a meaningful zoom-out as they read the
    // first few articles, instead of a barely-perceptible drift spread
    // across the entire article column.
    const ANIM_RANGE_VH = 150;

    const update = () => {
      queued = false;
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const range = (ANIM_RANGE_VH * vh) / 100;
      if (range <= 0) {
        setProgress(0);
        return;
      }
      const p = Math.max(0, Math.min(1, -rect.top / range));
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

  const scale = START_SCALE - (START_SCALE - 1) * progress;

  return (
    <section ref={sectionRef} className="relative bg-zinc-900">
      {/* Sticky wall pinned at viewport top for the duration of the section */}
      <div className="sticky top-0 z-0 flex h-screen w-full items-center justify-center overflow-hidden">
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
                sizes="20vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Articles overlay — pulled up by one viewport via inline style so
          it starts at the section's top, in front of the sticky wall.
          Using inline style instead of `-mt-[100vh]` because some Tailwind
          JIT configurations don't always emit the arbitrary-value class
          for negative viewport units. */}
      <div className="relative z-10" style={{ marginTop: "-100vh" }}>
        {children}
      </div>
    </section>
  );
}
