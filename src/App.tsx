"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Ambulance,
  Building2,
  Coins,
  Flame,
  Radio,
  Shield,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type StationType = "FIRE" | "EMS" | "POLICE";
type VehicleType = "ENGINE" | "AMBULANCE" | "PATROL";
type VehicleStatus = "AVAILABLE" | "DISPATCHED" | "RETURNING";
type IncidentStatus = "OPEN" | "RESPONDING" | "COMPLETE";

type Station = {
  id: number;
  name: string;
  type: StationType;
  level: number;
  x: number;
  y: number;
};

type Vehicle = {
  id: number;
  name: string;
  type: VehicleType;
  stationId: number;
  status: VehicleStatus;
  eta: number;
  incidentId: number | null;
};

type Incident = {
  id: number;
  title: string;
  required: VehicleType[];
  reward: number;
  x: number;
  y: number;
  status: IncidentStatus;
  assignedVehicleIds: number[];
};

type GameState = {
  credits: number;
  nextStationId: number;
  nextVehicleId: number;
  nextIncidentId: number;
  stations: Station[];
  vehicles: Vehicle[];
  incidents: Incident[];
  log: string[];
};

const STATION_TYPES = {
  FIRE: { label: "Fire", icon: Flame },
  EMS: { label: "EMS", icon: Ambulance },
  POLICE: { label: "Police", icon: Shield },
} as const;

const VEHICLE_TYPES = {
  ENGINE: { label: "Engine", stationType: "FIRE", cost: 300, icon: Flame },
  AMBULANCE: {
    label: "Ambulance",
    stationType: "EMS",
    cost: 250,
    icon: Ambulance,
  },
  PATROL: {
    label: "Patrol",
    stationType: "POLICE",
    cost: 220,
    icon: Shield,
  },
} as const;

const INCIDENT_TEMPLATES = [
  { title: "Kitchen Fire", required: ["ENGINE"], reward: 120 },
  { title: "Chest Pain", required: ["AMBULANCE"], reward: 90 },
  { title: "Burglary Report", required: ["PATROL"], reward: 100 },
  { title: "Shed Fire", required: ["ENGINE"], reward: 140 },
  {
    title: "Road Collision",
    required: ["ENGINE", "AMBULANCE", "PATROL"],
    reward: 250,
  },
  {
    title: "Person Trapped",
    required: ["ENGINE", "AMBULANCE"],
    reward: 190,
  },
] satisfies {
  title: string;
  required: VehicleType[];
  reward: number;
}[];

const initialState: GameState = {
  credits: 500,
  nextStationId: 4,
  nextVehicleId: 4,
  nextIncidentId: 1,
  stations: [
    {
      id: 1,
      name: "Central Fire Station",
      type: "FIRE",
      level: 1,
      x: 4,
      y: 5,
    },
    {
      id: 2,
      name: "City Ambulance Base",
      type: "EMS",
      level: 1,
      x: 7,
      y: 3,
    },
    {
      id: 3,
      name: "North Police Station",
      type: "POLICE",
      level: 1,
      x: 2,
      y: 2,
    },
  ],
  vehicles: [
    {
      id: 1,
      name: "Engine 1",
      type: "ENGINE",
      stationId: 1,
      status: "AVAILABLE",
      eta: 0,
      incidentId: null,
    },
    {
      id: 2,
      name: "Ambulance 1",
      type: "AMBULANCE",
      stationId: 2,
      status: "AVAILABLE",
      eta: 0,
      incidentId: null,
    },
    {
      id: 3,
      name: "Patrol 1",
      type: "PATROL",
      stationId: 3,
      status: "AVAILABLE",
      eta: 0,
      incidentId: null,
    },
  ],
  incidents: [],
  log: [
    "Welcome to Emergency Services. Dispatch units to incidents and grow your fleet.",
  ],
};

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function loadGame(): GameState {
  if (typeof window === "undefined") return initialState;

  try {
    const saved = localStorage.getItem("emergency-services-save-v1");
    return saved ? (JSON.parse(saved) as GameState) : initialState;
  } catch {
    return initialState;
  }
}

function saveGame(state: GameState) {
  localStorage.setItem("emergency-services-save-v1", JSON.stringify(state));
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "blue";
}) {
  const tones = {
    default: "bg-slate-100 text-slate-700 border-slate-200",
    good: "bg-emerald-100 text-emerald-700 border-emerald-200",
    warn: "bg-amber-100 text-amber-800 border-amber-200",
    bad: "bg-rose-100 text-rose-700 border-rose-200",
    blue: "bg-sky-100 text-sky-700 border-sky-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default function Page() {
  const [game, setGame] = useState<GameState>(() => loadGame());
  const [selectedBuild, setSelectedBuild] = useState<StationType>("FIRE");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

  useEffect(() => {
    saveGame(game);
  }, [game]);

  const activeIncidents = game.incidents.filter(
    (incident) => incident.status !== "COMPLETE",
  );

  const completedIncidents = game.incidents.filter(
    (incident) => incident.status === "COMPLETE",
  );

  const toLngLat = useCallback((x: number, y: number) => {
    const minLng = -122.5155;
    const maxLng = -122.355;
    const minLat = 37.705;
    const maxLat = 37.81;

    const lng = minLng + (x / 10) * (maxLng - minLng);
    const lat = maxLat - (y / 10) * (maxLat - minLat);

    return [lng, lat] as [number, number];
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || !mapToken || mapRef.current) return;

    mapboxgl.accessToken = mapToken;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: toLngLat(5, 5),
      zoom: 10.7,
      attributionControl: false,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapToken, toLngLat]);

  useEffect(() => {
    if (!mapRef.current) return;

    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];

    game.stations.forEach((station) => {
      const el = document.createElement("div");
      el.className =
        "flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-950 bg-sky-500 text-[10px] font-black text-white shadow-lg";
      el.title = station.name;
      el.textContent = station.type === "FIRE" ? "F" : station.type === "EMS" ? "E" : "P";

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(toLngLat(station.x, station.y))
        .addTo(mapRef.current!);

      markerRefs.current.push(marker);
    });

    activeIncidents.forEach((incident) => {
      const el = document.createElement("div");
      el.className =
        "flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-950 bg-rose-500 text-white shadow-lg";
      el.title = incident.title;
      el.innerHTML = "⚠";

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(toLngLat(incident.x, incident.y))
        .addTo(mapRef.current!);

      markerRefs.current.push(marker);
    });
  }, [activeIncidents, game.stations, toLngLat]);

  function spawnIncident() {
    setGame((current) => {
      const station = current.stations[rand(0, current.stations.length - 1)];
      const template =
        INCIDENT_TEMPLATES[rand(0, INCIDENT_TEMPLATES.length - 1)];

      const incident: Incident = {
        id: current.nextIncidentId,
        title: template.title,
        required: [...template.required],
        reward: template.reward,
        x: clamp(station.x + rand(-3, 3), 0, 10),
        y: clamp(station.y + rand(-3, 3), 0, 10),
        status: "OPEN",
        assignedVehicleIds: [],
      };

      return {
        ...current,
        nextIncidentId: current.nextIncidentId + 1,
        incidents: [...current.incidents, incident],
        log: [`New incident: ${incident.title}.`, ...current.log].slice(0, 8),
      };
    });
  }

  function dispatch(vehicleId: number, incidentId: number) {
    setGame((current) => {
      const vehicle = current.vehicles.find((v) => v.id === vehicleId);
      const incident = current.incidents.find((i) => i.id === incidentId);

      if (!vehicle || !incident) return current;

      const station = current.stations.find((s) => s.id === vehicle.stationId);

      if (!station) return current;

      const eta = Math.max(8, distance(station, incident) * 8);

      return {
        ...current,
        vehicles: current.vehicles.map((v) =>
          v.id === vehicleId
            ? {
                ...v,
                status: "DISPATCHED",
                eta,
                incidentId,
              }
            : v,
        ),
        incidents: current.incidents.map((i) =>
          i.id === incidentId
            ? {
                ...i,
                status: "RESPONDING",
                assignedVehicleIds: [...i.assignedVehicleIds, vehicleId],
              }
            : i,
        ),
        log: [
          `Dispatched ${vehicle.name} to ${incident.title}. ETA ${eta}s.`,
          ...current.log,
        ].slice(0, 8),
      };
    });
  }

  function buyVehicle(type: VehicleType) {
    setGame((current) => {
      const config = VEHICLE_TYPES[type];

      const station = current.stations.find(
        (s) => s.type === config.stationType,
      );

      if (!station || current.credits < config.cost) return current;

      const id = current.nextVehicleId;

      const vehicle: Vehicle = {
        id,
        name: `${config.label} ${id}`,
        type,
        stationId: station.id,
        status: "AVAILABLE",
        eta: 0,
        incidentId: null,
      };

      return {
        ...current,
        credits: current.credits - config.cost,
        nextVehicleId: id + 1,
        vehicles: [...current.vehicles, vehicle],
        log: [`Purchased ${vehicle.name}.`, ...current.log].slice(0, 8),
      };
    });
  }

  function buildStation(type: StationType) {
    setGame((current) => {
      const cost = 650;

      if (current.credits < cost) return current;

      const id = current.nextStationId;
      const label = STATION_TYPES[type].label;

      const station: Station = {
        id,
        name: `${label} Station ${id}`,
        type,
        level: 1,
        x: rand(0, 10),
        y: rand(0, 10),
      };

      return {
        ...current,
        credits: current.credits - cost,
        nextStationId: id + 1,
        stations: [...current.stations, station],
        log: [`Built ${station.name}.`, ...current.log].slice(0, 8),
      };
    });
  }

  function resetGame() {
    localStorage.removeItem("emergency-services-save-v1");
    setGame(initialState);
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((current) => {
        let creditsEarned = 0;

        let nextVehicles = current.vehicles.map((vehicle) => {
          if (
            (vehicle.status === "DISPATCHED" ||
              vehicle.status === "RETURNING") &&
            vehicle.eta > 0
          ) {
            return {
              ...vehicle,
              eta: vehicle.eta - 1,
            };
          }

          if (vehicle.status === "RETURNING" && vehicle.eta <= 0) {
            return {
              ...vehicle,
              status: "AVAILABLE" as VehicleStatus,
              incidentId: null,
              eta: 0,
            };
          }

          return vehicle;
        });

        const nextIncidents = current.incidents.map((incident) => {
          if (incident.status === "COMPLETE") return incident;

          const assignedVehicles = incident.assignedVehicleIds
            .map((id) => nextVehicles.find((v) => v.id === id))
            .filter((v): v is Vehicle => Boolean(v));

          const hasAllRequired = incident.required.every((requiredType) =>
            assignedVehicles.some(
              (vehicle) =>
                vehicle.type === requiredType &&
                vehicle.status === "DISPATCHED" &&
                vehicle.eta <= 0,
            ),
          );

          if (!hasAllRequired) return incident;

          creditsEarned += incident.reward;

          const assignedIds = new Set(incident.assignedVehicleIds);

          nextVehicles = nextVehicles.map((vehicle) =>
            assignedIds.has(vehicle.id)
              ? {
                  ...vehicle,
                  status: "RETURNING" as VehicleStatus,
                  incidentId: null,
                  eta: 12,
                }
              : vehicle,
          );

          return {
            ...incident,
            status: "COMPLETE" as IncidentStatus,
          };
        });

        const activeCount = nextIncidents.filter(
          (incident) => incident.status !== "COMPLETE",
        ).length;

        const shouldSpawn =
          Math.random() < 0.08 && activeCount < 6 && current.stations.length > 0;

        let finalIncidents = nextIncidents;
        let nextIncidentId = current.nextIncidentId;
        let nextLog = [...current.log];

        if (creditsEarned > 0) {
          nextLog = [
            `Incident resolved. Earned ${creditsEarned} credits.`,
            ...nextLog,
          ].slice(0, 8);
        }

        if (shouldSpawn) {
          const station = current.stations[rand(0, current.stations.length - 1)];
          const template =
            INCIDENT_TEMPLATES[rand(0, INCIDENT_TEMPLATES.length - 1)];

          const incident: Incident = {
            id: nextIncidentId,
            title: template.title,
            required: [...template.required],
            reward: template.reward,
            x: clamp(station.x + rand(-3, 3), 0, 10),
            y: clamp(station.y + rand(-3, 3), 0, 10),
            status: "OPEN",
            assignedVehicleIds: [],
          };

          nextIncidentId += 1;
          finalIncidents = [...finalIncidents, incident];
          nextLog = [`New incident: ${incident.title}.`, ...nextLog].slice(
            0,
            8,
          );
        }

        return {
          ...current,
          credits: current.credits + creditsEarned,
          nextIncidentId,
          vehicles: nextVehicles,
          incidents: finalIncidents,
          log: nextLog,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              Emergency Services
            </h1>
            <p className="text-sm text-slate-400">
              Dispatch units, resolve incidents, and expand your response
              network.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good">
              <Coins className="mr-1 h-3 w-3" />
              {game.credits} credits
            </Badge>

            <Badge tone="blue">
              <Radio className="mr-1 h-3 w-3" />
              {activeIncidents.length} active
            </Badge>

            <Badge>{completedIncidents.length} completed</Badge>

            <Button onClick={spawnIncident}>Spawn Incident</Button>

            <Button variant="outline" onClick={resetGame}>
              Reset
            </Button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-bold">City Grid</h2>
                <span className="text-xs text-slate-400">Mapbox live map</span>
              </div>

              {mapToken ? (
                <div
                  ref={mapContainerRef}
                  className="h-[460px] w-full rounded-2xl border border-slate-800"
                />
              ) : (
                <div className="rounded-2xl border border-amber-700 bg-amber-900/30 p-4 text-sm text-amber-100">
                  Add <code>VITE_MAPBOX_TOKEN</code> in your <code>.env</code>{" "}
                  file to enable the live map.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-slate-800 bg-slate-900 text-slate-100">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-xl font-bold">Build</h2>

                <div className="flex flex-wrap gap-2">
                  {(Object.keys(STATION_TYPES) as StationType[]).map((type) => {
                    const config = STATION_TYPES[type];
                    const Icon = config.icon;

                    return (
                      <Button
                        key={type}
                        variant={selectedBuild === type ? "default" : "outline"}
                        onClick={() => setSelectedBuild(type)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {config.label}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  className="w-full"
                  onClick={() => buildStation(selectedBuild)}
                  disabled={game.credits < 650}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  Build Station — 650 credits
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900 text-slate-100">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-xl font-bold">Buy Vehicles</h2>

                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((type) => {
                    const config = VEHICLE_TYPES[type];
                    const Icon = config.icon;

                    return (
                      <Button
                        key={type}
                        variant="outline"
                        onClick={() => buyVehicle(type)}
                        disabled={game.credits < config.cost}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {config.label} {config.cost}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Panel title="Active Incidents">
            {activeIncidents.length === 0 ? (
              <p className="text-sm text-slate-400">No active incidents.</p>
            ) : (
              activeIncidents.map((incident) => (
                <div
                  key={incident.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold">{incident.title}</h3>
                      <p className="text-xs text-slate-400">
                        Grid {incident.x},{incident.y} • Reward{" "}
                        {incident.reward}
                      </p>
                    </div>

                    <Badge tone={incident.status === "OPEN" ? "warn" : "blue"}>
                      {incident.status}
                    </Badge>
                  </div>

                  <p className="mt-2 text-xs text-slate-300">
                    Required: {incident.required.join(", ")}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...new Set(incident.required)].map((type) => {
                      const alreadyAssigned = incident.assignedVehicleIds.some(
                        (id) =>
                          game.vehicles.find((v) => v.id === id)?.type ===
                          type,
                      );

                      const match = game.vehicles.find(
                        (v) => v.status === "AVAILABLE" && v.type === type,
                      );

                      return (
                        <Button
                          key={type}
                          size="sm"
                          disabled={alreadyAssigned || !match}
                          onClick={() => {
                            if (match) dispatch(match.id, incident.id);
                          }}
                        >
                          {alreadyAssigned
                            ? `${type} sent`
                            : match
                              ? `Send ${match.name}`
                              : `No ${type}`}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Fleet">
            {game.vehicles.map((vehicle) => {
              const Icon = VEHICLE_TYPES[vehicle.type].icon;

              return (
                <div
                  key={vehicle.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />

                    <div>
                      <p className="font-semibold">{vehicle.name}</p>
                      <p className="text-xs text-slate-400">{vehicle.type}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <Badge
                      tone={
                        vehicle.status === "AVAILABLE"
                          ? "good"
                          : vehicle.status === "RETURNING"
                            ? "warn"
                            : "blue"
                      }
                    >
                      {vehicle.status}
                    </Badge>

                    {vehicle.eta > 0 && (
                      <p className="mt-1 text-xs text-slate-400">
                        {vehicle.eta}s
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </Panel>

          <Panel title="Stations & Log">
            <div className="space-y-2">
              {game.stations.map((station) => {
                const Icon = STATION_TYPES[station.type].icon;

                return (
                  <div
                    key={station.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3"
                  >
                    <Icon className="h-5 w-5" />

                    <div>
                      <p className="font-semibold">{station.name}</p>
                      <p className="text-xs text-slate-400">
                        {station.type} • Level {station.level} • Grid{" "}
                        {station.x},{station.y}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 space-y-2">
              {game.log.map((entry, index) => (
                <p
                  key={`${entry}-${index}`}
                  className="rounded-xl bg-slate-950 p-2 text-xs text-slate-300"
                >
                  {entry}
                </p>
              ))}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-100">
      <CardContent className="space-y-3 p-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="space-y-3">{children}</div>
      </CardContent>
    </Card>
  );
}