import { AppShell } from '../components/AppShell';
import { CapabilityMapView } from '../components/capability-map/CapabilityMapView';

export default function HomePage() {
  return (
    <AppShell>
      <CapabilityMapView />
    </AppShell>
  );
}
