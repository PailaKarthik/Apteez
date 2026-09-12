import { ArrowRight, PenLine, Target } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, CardDescription, CardTitle } from '@apteez/ui';

/** Personal areas: weekly targets (coming soon) and contributions (open). */
export function PersonalRow(): React.JSX.Element {
  return (
    <section aria-label="Your space" className="grid gap-3 md:grid-cols-2">
      <Card>
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <Target className="size-5" aria-hidden />
            </span>
            <Badge variant="warning">Coming soon</Badge>
          </div>
          <CardTitle className="text-base">Weekly Targets</CardTitle>
          <CardDescription>
            Set solve-count goals for the week and earn points for completing them. Target setting
            and rewards arrive in a later release.
          </CardDescription>
          <div className="mt-auto pt-1">
            <Button variant="outline" asChild>
              <Link href="/targets">
                See what&apos;s planned
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <PenLine className="size-5" aria-hidden />
          </span>
          <CardTitle className="text-base">Contribute questions</CardTitle>
          <CardDescription>
            Submit original aptitude questions. Every contribution passes human review before
            joining the library — approved authors earn recognition.
          </CardDescription>
          <div className="mt-auto pt-1">
            <Button asChild>
              <Link href="/contribute">
                Start contributing
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
