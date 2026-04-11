import { Link } from "wouter";
import { Scale } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
      <Scale className="w-12 h-12 text-primary/40 mb-4" />
      <h1 className="text-2xl font-bold text-foreground mb-2">Page introuvable</h1>
      <p className="text-muted-foreground text-sm mb-6">Cette page n'existe pas.</p>
      <Link href="/" className="text-primary text-sm hover:underline">
        Retour à l'assistant
      </Link>
    </div>
  );
}
