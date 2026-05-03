import horizontal from "@/assets/logos/mybeez-horizontal.svg";
import principal from "@/assets/logos/mybeez-principal.svg";
import picto from "@/assets/logos/mybeez-picto.svg";
import dark from "@/assets/logos/mybeez-dark.svg";
import monochrome from "@/assets/logos/mybeez-monochrome.svg";

type Variant = "horizontal" | "principal" | "picto" | "dark" | "monochrome";

const SOURCES: Record<Variant, string> = {
  horizontal,
  principal,
  picto,
  dark,
  monochrome,
};

export function Logo({
  variant = "horizontal",
  className = "",
  alt = "myBeez-ai",
}: {
  variant?: Variant;
  className?: string;
  alt?: string;
}) {
  return <img src={SOURCES[variant]} alt={alt} className={className} draggable={false} />;
}
