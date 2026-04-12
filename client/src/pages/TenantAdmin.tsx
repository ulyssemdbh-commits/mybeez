export default function TenantAdmin({ slug }: { slug: string }) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <a href={`/${slug}`} className="text-primary hover:underline text-sm">← Retour</a>
          <h1 className="text-xl font-bold capitalize">{slug} — Admin</h1>
        </div>
        <div className="bg-card rounded-xl border p-6 text-center text-muted-foreground">
          <p>Section Admin en cours de développement.</p>
        </div>
      </div>
    </div>
  );
}
