import { Check, Truck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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

type MissionProgress = {
  eta: number;
  mission: number;
  returnTrip: number;
  filing: number;
  overall: number;
  colorClass: string;
};

type IncomingDelivery = {
  id: number;
  vehicleType: VehicleType;
};

type Props = {
  activeIncidents: IncidentLike[];
  focusedIncidentId: number | null;
  missionProgress: (incident: IncidentLike) => MissionProgress;
  vehicles: VehicleLike[];
  credits: number;
  dispatchCost: number;
  onDispatchVehicle: (vehicleId: number, incidentId: number, routeKey?: string) => void;
  onLoadRouteOptions: (vehicleId: number, incidentId: number) => Promise<RouteOption[]>;
  incomingDeliveries: IncomingDelivery[];
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
  incomingDeliveries,
}: Props) {
  const [dispatchIncidentId, setDispatchIncidentId] = useState<number | null>(null);
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<VehicleType[]>([]);
  const [routeChoices, setRouteChoices] = useState<Record<number, RouteOption[]>>({});
  const [mobileBoardOpen, setMobileBoardOpen] = useState(false);

  const availableVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === "AVAILABLE"),
    [vehicles],
  );

  const newIncidents = useMemo(
    () =>
      activeIncidents
        .filter((incident) => incident.assignedVehicleIds.length === 0)
        .map((incident) => ({ incident, progress: missionProgress(incident) }))
        .sort((a, b) => a.incident.id - b.incident.id),
    [activeIncidents, missionProgress],
  );

  const activeDispatchIncidentId = useMemo(() => {
    if (newIncidents.length === 0) return null;
    if (dispatchIncidentId === null) return newIncidents[0].incident.id;
    const selectedStillOpen = newIncidents.some(
      ({ incident }) => incident.id === dispatchIncidentId,
    );
    return selectedStillOpen ? dispatchIncidentId : newIncidents[0].incident.id;
  }, [dispatchIncidentId, newIncidents]);

  const dispatchIncident = useMemo(
    () =>
      activeIncidents.find((incident) => incident.id === activeDispatchIncidentId) ?? null,
    [activeIncidents, activeDispatchIncidentId],
  );

  const requiredTypeCounts = useMemo(() => {
    if (!dispatchIncident) return {} as Partial<Record<VehicleType, number>>;
    const stage = dispatchIncident.stages[dispatchIncident.currentStage];
    return (stage?.required ?? []).reduce(
      (counts, type) => ({
        ...counts,
        [type]: (counts[type] ?? 0) + 1,
      }),
      {} as Partial<Record<VehicleType, number>>,
    );
  }, [dispatchIncident]);

  const missionAvailableTypeCounts = useMemo(
    () =>
      availableVehicles.reduce(
        (counts, vehicle) => {
          if (!requiredTypeCounts[vehicle.type]) return counts;
          return {
            ...counts,
            [vehicle.type]: (counts[vehicle.type] ?? 0) + 1,
          };
        },
        {} as Partial<Record<VehicleType, number>>,
      ),
    [availableVehicles, requiredTypeCounts],
  );

  useEffect(() => {
    if (!dispatchIncident || selectedVehicleTypes.length === 0) return;
    let cancelled = false;
    const incidentId = dispatchIncident.id;

    async function preloadRoutes() {
      for (const vehicleType of selectedVehicleTypes) {
        const requiredCount = requiredTypeCounts[vehicleType] ?? 0;
        if (requiredCount <= 0) continue;
        const dispatchableVehicles = availableVehicles
          .filter((vehicle) => vehicle.type === vehicleType)
          .slice(0, requiredCount);

        for (const vehicle of dispatchableVehicles) {
          if ((routeChoices[vehicle.id] ?? []).length > 0) continue;
          const options = await onLoadRouteOptions(vehicle.id, incidentId);
          if (cancelled || options.length === 0) continue;
          setRouteChoices((current) =>
            (current[vehicle.id] ?? []).length > 0 ? current : { ...current, [vehicle.id]: options },
          );
        }
      }
    }

    void preloadRoutes();
    return () => {
      cancelled = true;
    };
  }, [
    availableVehicles,
    dispatchIncident,
    onLoadRouteOptions,
    requiredTypeCounts,
    routeChoices,
    selectedVehicleTypes,
  ]);


  const deliveryTitleByType: Record<VehicleType, string> = {
    ENGINE: "New firetruck",
    LADDER: "New ladder truck",
    AMBULANCE: "New ambulance",
    RESCUE: "New rescue unit",
    PATROL: "New patrol car",
    SWAT: "New tactical truck",
  };

  const getCardProgressFillClass = (colorClass: string) => {
    if (colorClass.includes("amber")) return "bg-amber-500/18";
    if (colorClass.includes("emerald")) return "bg-emerald-500/18";
    return "bg-sky-500/18";
  };

  if (newIncidents.length === 0 && incomingDeliveries.length === 0) {
    return null;
  }
  
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="absolute bottom-2 right-2 z-30 md:hidden"
        onClick={() => setMobileBoardOpen((open) => !open)}
      >
        {mobileBoardOpen ? "Hide popups" : `Popups (${newIncidents.length})`}
      </Button>

      <div className={`absolute bottom-2 left-2 right-2 z-30 max-h-[42vh] space-y-1.5 overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-950/85 p-2 shadow-2xl backdrop-blur-sm ${mobileBoardOpen ? "block" : "hidden"} md:hidden`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-100">New Incident Popups</h2>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 md:hidden"
          onClick={() => setMobileBoardOpen(false)}
        >
          Close
        </Button>
      </div>
      {newIncidents.length === 0 ? (
        <p className="text-xs text-slate-400">No new incidents.</p>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-slate-800/80 bg-slate-900/70 p-1.5">
          <div className="flex items-center justify-between">
            <Badge tone="warn">NEW</Badge>
            <span className="text-[10px] text-slate-400">{newIncidents.length}</span>
          </div>
          {incomingDeliveries.length > 0 && (
            <div className="space-y-1">
              {incomingDeliveries.map((delivery) => (
                <div
                  key={`delivery-${delivery.id}`}
                  className="rounded-lg border border-amber-500/60 bg-amber-950/20 p-2"
                >
                  <p className="text-xs font-semibold text-amber-200">{deliveryTitleByType[delivery.vehicleType]}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {newIncidents.map(({ incident, progress }) => {
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
                        setSelectedVehicleTypes([]);
                        setRouteChoices({});
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
                })}
          </div>
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
                <p className="text-[10px] text-slate-400">
                  Required: {Object.entries(requiredTypeCounts).map(([type, count]) => `${count} ${type}`).join(", ")}
                </p>
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
              {Object.keys(missionAvailableTypeCounts).length === 0 ? (
                <p className="text-xs text-slate-400">No available vehicles.</p>
              ) : (
                Object.entries(missionAvailableTypeCounts).map(([type, availableCount]) => {
                  const vehicleType = type as VehicleType;
                  const selected = selectedVehicleTypes.includes(vehicleType);
                  const requiredCount = requiredTypeCounts[vehicleType] ?? 0;
                  return (
                    <button
                      key={vehicleType}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          setSelectedVehicleTypes((current) =>
                            current.filter((entry) => entry !== vehicleType),
                          );
                          return;
                        }
                        setSelectedVehicleTypes((current) => [...current, vehicleType]);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                        selected
                          ? "border-sky-500 bg-sky-500/15 text-sky-100"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5" />
                        {vehicleType} • {availableCount} available
                      </span>
                      <span className="text-[10px] text-slate-300">Need {requiredCount}</span>
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                    </button>
                  );
                })
              )}
              {selectedVehicleTypes.map((vehicleType) => {
                const requiredCount = requiredTypeCounts[vehicleType] ?? 0;
                const dispatchableVehicles = availableVehicles
                  .filter((vehicle) => vehicle.type === vehicleType)
                  .slice(0, requiredCount);
                return dispatchableVehicles.map((vehicle) => {
                  const fastestRoute = (routeChoices[vehicle.id] ?? [])[0];
                  if (!fastestRoute) return null;
                  return (
                    <div key={vehicle.id} className="rounded border border-slate-700 p-2 text-[10px] text-slate-300">
                      <p className="font-medium text-slate-100">Fastest route for {vehicle.name}</p>
                      <p>{fastestRoute.distanceKm.toFixed(1)} km • {fastestRoute.etaSeconds}s</p>
                    </div>
                  );
                });
              })}
            </div>

            <Button
              className="mt-3 w-full"
              disabled={selectedVehicleTypes.length === 0 || credits < dispatchCost}
              onClick={async () => {
                for (const vehicleType of selectedVehicleTypes) {
                  const requiredCount = requiredTypeCounts[vehicleType] ?? 0;
                  const dispatchableVehicles = availableVehicles
                    .filter((vehicle) => vehicle.type === vehicleType)
                    .slice(0, requiredCount);
                  for (const vehicle of dispatchableVehicles) {
                    const options = await onLoadRouteOptions(vehicle.id, dispatchIncident.id);
                    setRouteChoices((current) => ({ ...current, [vehicle.id]: options }));
                    onDispatchVehicle(vehicle.id, dispatchIncident.id, options[0]?.key);
                  }
                }
                setDispatchIncidentId(null);
                setSelectedVehicleTypes([]);
              }}
            >
              Dispatch selected ({selectedVehicleTypes.length})
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
