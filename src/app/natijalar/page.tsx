import type { Metadata } from "next";
import { PublicResults } from "./PublicResults";

export const metadata: Metadata = { title: "Bizning natijalar" };

export default function NatijalarPage() {
  return <PublicResults />;
}
