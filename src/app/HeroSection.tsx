"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const IMAGES = [
  "/images/bht/67658e6d5bbf6d25065cae74_IMG_2832__1_.avif",
  "/images/bht/67658e6f7d20eca9f6bf046f_IMG_6431.avif",
  "/images/bht/67658e702ebdb35ccbcb3876_IMG_7831.avif",
  "/images/bht/67658e7075ea3ce7f7a94474_IMG_7825.avif",
  // Index 4 (center cell) is the hero / focal image
  "/images/bht/682c343a20a8821d212445eb_49b8a28009289bc99847e7803987c40b_IMG_9691.webp",
  "/images/bht/6787b903dfc14c54318e85d1_IMG_2260_1.webp",
  "/images/bht/682c37725850458f4c325aa7_063c97599b82df3b628f42e9dffc986a_IMG_0344.webp",
  "/images/bht/MIT-Media-Lab-Panel.webp",
  "/images/bht/680a67d1ef8ec2948110caf1_e68ac228385ffdcc0ec44eaca54c6d0e_IMG_0140_1.webp",
];

const HERO_INDEX = 4;

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
      // Section is taller than the viewport; sticky inner pins for the
      // (sectionHeight - vh) range. Map that range to progress 0→1.
      const sectionHeight = sectionRef.current.offsetHeight;
      const stickyRange = sectionHeight - vh;
      // -rect.top equals how much of the section has scrolled past the top.
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

  // Ease-out for a softer feel — fast start, smooth landing.
  const eased = 1 - Math.pow(1 - progress, 2);

  // The hero image animates from filling the container to occupying the
  // center cell of a 3×3 grid (33.33% × 33.33%, offset 33.33% from top/left).
  const overlayTop = `${eased * 33.333}%`;
  const overlayLeft = `${eased * 33.333}%`;
  const overlaySize = `${100 - eased * 66.667}%`;

  // Other cells fade in slightly ahead of the hero finishing its shrink so the
  // grid feels assembled before the focal image fully settles.
  const cellsOpacity = Math.min(1, eased * 1.25);

  return (
    <section ref={sectionRef} className="relative h-[220vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-zinc-100">
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {IMAGES.map((src, i) => (
            <div
              key={i}
              className="relative overflow-hidden bg-zinc-200 outline outline-1 outline-white"
              style={{
                opacity: i === HERO_INDEX ? 1 : cellsOpacity,
                transitionProperty: "opacity",
              }}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="(min-width: 640px) 33vw, 33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        <div
          className="absolute overflow-hidden will-change-[top,left,width,height]"
          style={{
            top: overlayTop,
            left: overlayLeft,
            width: overlaySize,
            height: overlaySize,
          }}
        >
          <Image
            src={IMAGES[HERO_INDEX]}
            alt="Practitioners working out humane technology principles on a whiteboard"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
