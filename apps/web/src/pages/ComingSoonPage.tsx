import { Card, Badge } from '../components/ui';

export function ComingSoonPage({
  title,
  phase,
  description,
}: {
  title: string;
  phase?: string;
  description?: string;
}) {
  return (
    <Card className="space-y-3 text-center">
      <div className="text-4xl">🚧</div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {phase && <Badge className="bg-amber-100 text-amber-700">{phase}</Badge>}
      {description && <p className="text-sm text-slate-600">{description}</p>}
    </Card>
  );
}
