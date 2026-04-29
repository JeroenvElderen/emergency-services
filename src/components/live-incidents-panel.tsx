import { Check, Truck } from "lucide-react";
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

type RouteOption = {
  key: string;
  label: string;
  color: string;
  distanceKm: number;
  etaSeconds: number;
  coordinates: [number, number][];
};

type RoutePreview = {
  incidentId: number;
  routes: RouteOption[];
  selectedRouteKey?: string;
};

type MissionProgress = {
  eta: number;
  mission: number;
  returnTrip: number;
  filing: number;
  overall: number;
  colorClass: string;
};

type IncidentFlightPhase = "NEW" | "ENROUTE" | "ON SCENE" | "RETURN";

type Props = {
  activeIncidents: IncidentLike[];
  focusedIncidentId: number | null;
  missionProgress: (incident: IncidentLike) => MissionProgress;
  vehicles: VehicleLike[];
  credits: number;
  dispatchCost: number;
  onDispatchVehicle: (vehicleId: number, incidentId: number, routeKey?: string) => void;
  onLoadRouteOptions: (vehicleId: number, incidentId: number) => Promise<RouteOption[]>;
  onRoutePreviewChange: (preview: RoutePreview | null) => void;
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
  onDispatchVehicle,
  onLoadRouteOptions,
  onRoutePreviewChange,
}: Props) {
  const [dispatchIncidentId, setDispatchIncidentId] = useState<number | null>(null);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [routeChoices, setRouteChoices] = useState<Record<number, RouteOption[]>>({});
  const [selectedRoutes, setSelectedRoutes] = useState<Record<number, string>>({});

  const dispatchIncident = useMemo(
    () =>
      activeIncidents.find((incident) => incident.id === dispatchIncidentId) ?? null,
    [activeIncidents, dispatchIncidentId],
  );

  const availableVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === "AVAILABLE"),
    [vehicles],
  );


  const getFlightPhase = (incident: IncidentLike, progress: MissionProgress): IncidentFlightPhase => {
    if (incident.assignedVehicleIds.length === 0) return "NEW";
    if (progress.mission < 0.85) return "ENROUTE";
    if (progress.returnTrip < 0.95) return "ON SCENE";
    return "RETURN";
  };

  const phaseOrder: IncidentFlightPhase[] = ["NEW", "ENROUTE", "ON SCENE", "RETURN"];

  const incidentsByPhase = useMemo(() => {
    const grouped = Object.fromEntries(
      phaseOrder.map((phase) => [phase, [] as Array<{ incident: IncidentLike; progress: MissionProgress }>]),
    ) as Record<IncidentFlightPhase, Array<{ incident: IncidentLike; progress: MissionProgress }>>;

    for (const incident of activeIncidents) {
      const progress = missionProgress(incident);
      const phase = getFlightPhase(incident, progress);
      grouped[phase].push({ incident, progress });
    }

    for (const phase of phaseOrder) {
      grouped[phase].sort((a, b) => b.incident.id - a.incident.id);
    }

    return grouped;
  }, [activeIncidents, missionProgress]);

  const getFlightPhaseTone = (phase: IncidentFlightPhase): "warn" | "blue" | "good" => {
    if (phase === "NEW") return "warn";
    if (phase === "RETURN") return "good";
    return "blue";
  };

  const getCardProgressFillClass = (colorClass: string) => {
    if (colorClass.includes("amber")) return "bg-amber-500/18";
    if (colorClass.includes("emerald")) return "bg-emerald-500/18";
    return "bg-sky-500/18";
  };

  return (
    <>
      <div className="absolute bottom-3 right-3 z-30 max-h-[45vh] w-[min(96vw,1100px)] space-y-1.5 overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-950/85 p-2.5 shadow-2xl backdrop-blur-sm">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-100">Live Incidents</h2>
      {activeIncidents.length === 0 ? (
        <p className="text-xs text-slate-400">No active incidents.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {phaseOrder.map((phase) => (
            <div key={phase} className="space-y-1.5 rounded-lg border border-slate-800/80 bg-slate-900/70 p-1.5">
              <div className="flex items-center justify-between">
                <Badge tone={getFlightPhaseTone(phase)}>{phase}</Badge>
                <span className="text-[10px] text-slate-400">{incidentsByPhase[phase].length}</span>
              </div>
              {incidentsByPhase[phase].length === 0 ? (
                <p className="px-1 py-2 text-[10px] text-slate-500">No incidents</p>
              ) : (
                incidentsByPhase[phase].map(({ incident, progress }) => {
                  const stage = incident.stages[incident.currentStage];
                  const completionClass = progress.overall >= 0.85
                    ? "ring-1 ring-emerald-500/50"
                    : progress.overall >= 0.45
                      ? "ring-1 ring-amber-500/40"
                      : "";
                  return (
                    <button
                      key={incident.id}
                      type="button"
                      onClick={() => {
                        setDispatchIncidentId(incident.id);
                        setSelectedVehicleIds([]);
                        setRouteChoices({});
                        setSelectedRoutes({});
                        onRoutePreviewChange(null);
                      }}
                      className={`relative overflow-hidden rounded-lg border p-2 transition ${
                        focusedIncidentId === incident.id
                          ? "border-sky-500/80 bg-sky-950/40"
                          : "border-slate-700 bg-slate-900/90 hover:border-sky-600/70"
                      } ${completionClass}`}
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
              </div>
              </button>
                  );
                })
              )}
              </div>
              ))}
        </div>
      )}
      </div>

      {dispatchIncident && (
        <div className="absolute inset-x-0 bottom-0 z-40 flex justify-center p-3 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-sky-700/50 bg-slate-950/95 p-3 shadow-2xl">
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
                      onClick={async () => {
                        if (selected) {
                          setSelectedVehicleIds((current) => current.filter((id) => id !== vehicle.id));
                          onRoutePreviewChange(null);
                          return;
                        }
                        setSelectedVehicleIds((current) => [...current, vehicle.id]);
                        const options = await onLoadRouteOptions(vehicle.id, dispatchIncident.id);
                        setRouteChoices((current) => ({ ...current, [vehicle.id]: options }));
                        if (options[0]) {
                          setSelectedRoutes((current) => ({ ...current, [vehicle.id]: options[0].key }));
                          onRoutePreviewChange({
                            incidentId: dispatchIncident.id,
                            routes: options,
                            selectedRouteKey: options[0].key,
                          });
                        }
                      }}
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
              {selectedVehicleIds.map((vehicleId) => {
                const options = routeChoices[vehicleId] ?? [];
                if (options.length === 0) return null;
                return (
                  <div key={vehicleId} className="rounded border border-slate-700 p-2">
                    <p className="mb-1 text-[10px] text-slate-300">Route for vehicle #{vehicleId}</p>
                    <div className="space-y-1">
                      {options.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            setSelectedRoutes((current) => ({ ...current, [vehicleId]: option.key }));
                            onRoutePreviewChange({
                              incidentId: dispatchIncident.id,
                              routes: options,
                              selectedRouteKey: option.key,
                            });
                          }}
                          className={`flex w-full items-center justify-between rounded border px-2 py-1 text-[10px] ${selectedRoutes[vehicleId] === option.key ? "border-sky-500 bg-sky-500/10" : "border-slate-700 bg-slate-900"}`}
                        >
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: option.color }} />{option.label}</span>
                          <span>{option.distanceKm.toFixed(1)} km • {option.etaSeconds}s</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              className="mt-3 w-full"
              disabled={selectedVehicleIds.length === 0 || credits < dispatchCost}
              onClick={() => {
                selectedVehicleIds.forEach((vehicleId) => {
                  onDispatchVehicle(vehicleId, dispatchIncident.id, selectedRoutes[vehicleId]);
                });
                onRoutePreviewChange(null);
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
