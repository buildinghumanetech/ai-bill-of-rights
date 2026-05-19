"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// The 9 BHT images that form the original 3x3. These are also the inner
// 3x3 of the 5x5 in WallBehindArticles below, so the user sees visual
// continuity from this hero into the wall behind the articles.
const BHT_3X3 = [
  "/images/bht/67658e6d5bbf6d25065cae74_IMG_2832__1_.avif",
  "/images/bht/67658e6f7d20eca9f6bf046f_IMG_6431.avif",
  "/images/bht/67658e702ebdb35ccbcb3876_IMG_7831.avif",
  "/images/bht/67658e7075ea3ce7f7a94474_IMG_7825.avif",
  "/images/bht/682c343a20a8821d212445eb_49b8a28009289bc99847e7803987c40b_IMG_9691.webp", // center (index 4)
  "/images/bht/6787b903dfc14c54318e85d1_IMG_2260_1.webp",
  "/images/bht/682c37725850458f4c325aa7_063c97599b82df3b628f42e9dffc986a_IMG_0344.webp",
  "/images/bht/MIT-Media-Lab-Panel.webp",
  "/images/bht/680a67d1ef8ec2948110caf1_e68ac228385ffdcc0ec44eaca54c6d0e_IMG_0140_1.webp",
];

const COLS = 3;
const CENTER_INDEX = 4;
const START_SCALE = COLS; // one cell fills viewport at scale=3

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

  // Section is short (200vh) so the user only scrolls ~one viewport before
  // the 9-box is fully revealed and Article 01 starts coming into view.
  const scale = START_SCALE - (START_SCALE - 1) * progress;

  return (
    <section ref={sectionRef} className="relative h-[200vh]">
      <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden bg-zinc-900">
        <div
          className="grid w-full will-change-transform"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${COLS}, 1fr)`,
            transformOrigin: "50% 50%",
            transform: `scale(${scale})`,
          }}
        >
          {BHT_3X3.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="relative aspect-square overflow-hidden bg-zinc-800"
            >
              <Image
                src={src}
                alt=""
                fill
                priority={i === CENTER_INDEX}
                sizes="33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
