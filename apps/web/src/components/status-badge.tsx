import {
  AlertCircle,
  CheckCircle2,
  Clock,
  LoaderCircle,
  PauseCircle,
  SkipForward,
  XCircle,
} from "lucide-react";
import { Badge } from "./ui/badge.js";

export function StatusBadge({ status }: { readonly status: string }) {
  switch (status) {
    case "succeeded":
    case "ready":
    case "approved":
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          <span className="capitalize">{status.replaceAll("_", " ")}</span>
        </Badge>
      );
    case "failed":
    case "rejected":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3" aria-hidden="true" />
          <span className="capitalize">{status.replaceAll("_", " ")}</span>
        </Badge>
      );
    case "waiting_approval":
    case "pending":
      return (
        <Badge variant="warning">
          <PauseCircle className="h-3 w-3" aria-hidden="true" />
          <span className="capitalize">{status.replaceAll("_", " ")}</span>
        </Badge>
      );
    case "running":
    case "validating":
    case "uploading":
      return (
        <Badge variant="purple">
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
          <span className="capitalize">{status.replaceAll("_", " ")}</span>
        </Badge>
      );
    case "queued":
      return (
        <Badge variant="default">
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span className="capitalize">Queued</span>
        </Badge>
      );
    case "skipped":
      return (
        <Badge variant="outline">
          <SkipForward className="h-3 w-3" aria-hidden="true" />
          <span>Skipped</span>
        </Badge>
      );
    case "cancelled":
    case "deleting":
    default:
      return (
        <Badge variant="default">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          <span className="capitalize">{status.replaceAll("_", " ")}</span>
        </Badge>
      );
  }
}

