import {
  CircleHelp,
  CheckCircle2,
  Link,
  TriangleAlert,
  Sparkles,
} from "lucide-react";
import { statuses, type Status } from "../domain/property";
const icons = {
  missing: CircleHelp,
  verified: CheckCircle2,
  listing: Link,
  conflicting: TriangleAlert,
  estimated: Sparkles,
};
export default function ProvenanceBadge({ status }: { status: Status }) {
  const Icon = icons[status];
  return (
    <span className={`provenance provenance-${status}`}>
      <Icon size={13} aria-hidden="true" />
      {statuses[status]}
    </span>
  );
}
