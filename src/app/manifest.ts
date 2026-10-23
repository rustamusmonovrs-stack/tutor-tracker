import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jurnal",
    short_name: "Jurnal",
    description: "Lesson journal for my groups",
    start_url: "/",
    display: "standalone",
    background_color: "#edf0f5",
    theme_color: "#1f3a93",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
