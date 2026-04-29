import { Check, MapPinned, Truck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

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
  onRequestAiSupport: (incident: IncidentLike) => void;
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
  onRequestAiSupport,
}: Props) {
  const [dispatchIncidentId, setDispatchIncidentId] = useState<number | null>(null);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);

  const dispatchIncident = useMemo(
    () =>
      activeIncidents.find((incident) => incident.id === dispatchIncidentId) ?? null,
    [activeIncidents, dispatchIncidentId],
  );

  const availableVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === "AVAILABLE"),
    [vehicles],
  );

  const getCardProgressFillClass = (colorClass: string) => {
    if (colorClass.includes("amber")) return "bg-amber-500/18";
    if (colorClass.includes("emerald")) return "bg-emerald-500/18";
    return "bg-sky-500/18";
  };

  return (
    <>
      <div className="absolute bottom-3 right-3 z-30 max-h-[45vh] w-[320px] space-y-1.5 overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-950/85 p-2.5 shadow-2xl backdrop-blur-sm">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-100">Live Incidents</h2>
      {activeIncidents.length === 0 ? (
        <p className="text-xs text-slate-400">No active incidents.</p>
      ) : (
        activeIncidents.map((incident) => {
          const stage = incident.stages[incident.currentStage];
          const progress = missionProgress(incident);
          return (
            <div
              key={incident.id}
              className={`relative overflow-hidden rounded-lg border p-2 transition ${
                focusedIncidentId === incident.id
                  ? "border-sky-500/80 bg-sky-950/40"
                  : "border-slate-700 bg-slate-900/90"
              }`}
            >
              <div
                className={`pointer-events-none absolute inset-y-0 left-0 transition-all ${getCardProgressFillClass(progress.colorClass)}`}
                style={{ width: `${Math.round(progress.overall * 100)}%` }}
                aria-hidden="true"
              />

              <div className="relative z-10 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-100">{incident.title}</p>
                  <p className="text-[10px] text-slate-400">
                    {stage?.label} • reward {incident.reward}
                  </p>
                </div>
                <Badge tone={incident.status === "OPEN" ? "warn" : "blue"}>
                  {incident.status}
                </Badge>
              </div>
              <div className="relative z-10 mt-2 flex gap-1">
                <Button size="sm" variant="outline" onClick={() => onFocusIncident(incident)}>
                  <MapPinned className="mr-1 h-3.5 w-3.5" />
                  Focus map
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setDispatchIncidentId(incident.id);
                    setSelectedVehicleIds([]);
                  }}
                  disabled={availableVehicles.length === 0}
                >
                  Select vehicles
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDispatchSuggested(incident)}
                  disabled={credits < dispatchCost}
                >
                  Auto
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRequestAiSupport(incident)}
                  title="AI follows the user-configured response behavior"
                >
                  AI
                </Button>
              </div>
              <p className="relative z-10 mt-2 text-[10px] text-slate-300">
                Progress: {Math.round(progress.overall * 100)}%
              </p>
              <p className="relative z-10 mt-1 text-[10px] text-sky-300">
                AI support follows the response setup made for the user.
              </p>

              <p className="relative z-10 mt-1 text-[10px] text-slate-400">
                Assigned: {incident.assignedVehicleIds.length} • Required types:{" "}
                {[...new Set(stage?.required ?? [])].join(", ") || "Any"}
              </p>
            </div>
          );
        })
      )}
      </div>

      {dispatchIncident && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-3">
          <div className="w-full max-w-md rounded-xl border border-sky-700/50 bg-slate-950/95 p-3 shadow-2xl">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Dispatch vehicles</p>
                <p className="text-sm font-semibold text-slate-100">{dispatchIncident.title}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDispatchIncidentId(null)}
              >
                Close
              </Button>
            </div>

            <div className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
              {availableVehicles.length === 0 ? (
                <p className="text-xs text-slate-400">No available vehicles.</p>
              ) : (
                availableVehicles.map((vehicle) => {
                  const selected = selectedVehicleIds.includes(vehicle.id);
                  return (
                    <button
                      key={vehicle.id}
                      type="button"
                      onClick={() =>
                        setSelectedVehicleIds((current) =>
                          selected
                            ? current.filter((id) => id !== vehicle.id)
                            : [...current, vehicle.id],
                        )
                      }
                      className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                        selected
                          ? "border-sky-500 bg-sky-500/15 text-sky-100"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5" />
                        {vehicle.name} • {vehicle.type}
                      </span>
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                    </button>
                  );
                })
              )}
            </div>

            <Button
              className="mt-3 w-full"
              disabled={selectedVehicleIds.length === 0 || credits < dispatchCost}
              onClick={() => {
                selectedVehicleIds.forEach((vehicleId) => {
                  onDispatchVehicle(vehicleId, dispatchIncident.id);
                });
                setDispatchIncidentId(null);
                setSelectedVehicleIds([]);
              }}
            >
              Dispatch selected ({selectedVehicleIds.length})
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
