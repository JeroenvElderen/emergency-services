import { MapPinned } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { IncidentStatus, VehicleStatus, VehicleType } from "@/types/game";

type IncidentStage = {
  label: string;
  required: VehicleType[];
};

export type IncidentLike = {
  id: number;
  title: string;
  status: IncidentStatus;
  reward: number;
  lat: number;
  lng: number;
  currentStage: number;
  stages: IncidentStage[];
  assignedVehicleIds: number[];
};

type VehicleLike = {
  id: number;
  name: string;
  type: VehicleType;
  status: VehicleStatus;
};

type MissionProgress = {
  eta: number;
  mission: number;
  returnTrip: number;
  filing: number;
  overall: number;
  colorClass: string;
};

type Props = {
  activeIncidents: IncidentLike[];
  focusedIncidentId: number | null;
  missionProgress: (incident: IncidentLike) => MissionProgress;
  vehicles: VehicleLike[];
  credits: number;
  dispatchCost: number;
  onFocusIncident: (incident: IncidentLike) => void;
  onDispatchSuggested: (incident: IncidentLike) => void;
  onDispatchVehicle: (vehicleId: number, incidentId: number) => void;
};

function Badge({
  tone = "default",
  children,
}: {
  tone?: "default" | "good" | "warn" | "bad" | "blue";
  children: ReactNode;
}) {
  const toneClass = {
    default: "bg-slate-700 text-slate-100",
    good: "bg-emerald-700/80 text-emerald-50",
    warn: "bg-amber-700/80 text-amber-50",
    bad: "bg-rose-700/80 text-rose-50",
    blue: "bg-sky-700/80 text-sky-50",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${toneClass}`}>
      {children}
    </span>
  );
}

export function LiveIncidentsPanel({
  activeIncidents,
  focusedIncidentId,
  missionProgress,
  vehicles,
  credits,
  dispatchCost,
  onFocusIncident,
  onDispatchSuggested,
  onDispatchVehicle,
}: Props) {
  return (
    <div className="absolute bottom-3 right-3 z-30 max-h-[52vh] w-[360px] space-y-2 overflow-y-auto rounded-2xl border border-slate-700/70 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-sm">
      <h2 className="text-sm font-bold">Live Incidents</h2>
      {activeIncidents.length === 0 ? (
        <p className="text-xs text-slate-400">No active incidents.</p>
      ) : (
        activeIncidents.map((incident) => {
          const stage = incident.stages[incident.currentStage];
          const progress = missionProgress(incident);
          const requiredTypes = [...new Set(stage?.required ?? [])];
          return (
            <div
              key={incident.id}
              className={`rounded-xl border p-2 transition ${
                focusedIncidentId === incident.id
                  ? "border-sky-500 bg-sky-950/40"
                  : "border-slate-700 bg-slate-900/90"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{incident.title}</p>
                  <p className="text-[11px] text-slate-400">
                    {stage?.label} • reward {incident.reward}
                  </p>
                </div>
                <Badge tone={incident.status === "OPEN" ? "warn" : "blue"}>
                  {incident.status}
                </Badge>
              </div>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => onFocusIncident(incident)}>
                  <MapPinned className="mr-1 h-3.5 w-3.5" />
                  Focus map
                </Button>
                <Button
                  size="sm"
                  onClick={() => onDispatchSuggested(incident)}
                  disabled={credits < dispatchCost}
                >
                  Dispatch suggested
                </Button>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Mission progress</span>
                  <span>{Math.round(progress.overall * 100)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                  <div
                    className={`h-full transition-all ${progress.colorClass}`}
                    style={{ width: `${Math.round(progress.overall * 100)}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-300">
                <span>1) ETA: {Math.round(progress.eta * 100)}%</span>
                <span>2) On scene: {Math.round(progress.mission * 100)}%</span>
                <span>3) ETA back: {Math.round(progress.returnTrip * 100)}%</span>
                <span>4) Filing: {Math.round(progress.filing * 100)}%</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {requiredTypes.map((type) => {
                  const assignedCountForType = incident.assignedVehicleIds.filter(
                    (id) => vehicles.find((v) => v.id === id)?.type === type,
                  ).length;
                  const availableMatches = vehicles.filter(
                    (v) => v.status === "AVAILABLE" && v.type === type,
                  );
                  return (
                    <div key={`${incident.id}-${type}`} className="rounded-lg border border-slate-700/80 p-1.5">
                      <p className="mb-1 text-[11px] font-medium text-slate-300">{type}</p>
                      <div className="flex flex-wrap gap-1">
                        {assignedCountForType > 0 ? (
                          <Badge tone="good">
                            {assignedCountForType} {type} assigned
                          </Badge>
                        ) : null}
                        {availableMatches.length === 0 ? (
                          <Badge tone="bad">No available {type}</Badge>
                        ) : (
                          availableMatches.map((vehicle) => (
                            <Button
                              key={vehicle.id}
                              size="sm"
                              variant="outline"
                              disabled={credits < dispatchCost}
                              onClick={() => onDispatchVehicle(vehicle.id, incident.id)}
                            >
                              {vehicle.name}
                            </Button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}