import { AppShell } from '../components/AppShell';

export default function HomePage() {
  return (
    <AppShell>
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-lg font-medium text-fg">Capability Map</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Open a file or create a new map to get started.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
