"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Ambulance,
  Coins,
  Expand,
  Flame,
  Radio,
  Shield,
  Shrink,
  Siren,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type StationType = "FIRE" | "EMS" | "POLICE";
type VehicleType =
  | "ENGINE"
  | "LADDER"
  | "AMBULANCE"
  | "RESCUE"
  | "PATROL"
  | "SWAT";
type IncidentCategory = "FIRE" | "EMS" | "POLICE";
type VehicleStatus = "AVAILABLE" | "DISPATCHED" | "RETURNING";
type IncidentStatus = "OPEN" | "RESPONDING" | "COMPLETE";

type Station = {
  id: number;
  name: string;
  type: StationType;
  level: number;
  lat: number;
  lng: number;
};

type Vehicle = {
  id: number;
  name: string;
  type: VehicleType;
  stationId: number;
  status: VehicleStatus;
  eta: number;
  totalEta: number;
  incidentId: number | null;
  route: [number, number][];
};

type IncidentStage = {
  label: string;
  required: VehicleType[];
};

type Incident = {
  id: number;
  title: string;
  category: IncidentCategory;
  severity: number;
  reward: number;
  lat: number;
  lng: number;
  status: IncidentStatus;
  currentStage: number;
  stages: IncidentStage[];
  assignedVehicleIds: number[];
};

type GameState = {
  credits: number;
  employees: number;
  nextStationId: number;
  nextVehicleId: number;
  nextIncidentId: number;
  resolvedCount: number;
  stations: Station[];
  vehicles: Vehicle[];
  incidents: Incident[];
  log: string[];
};

const STATION_COST = 650;
const DISPATCH_COST = 18;
const MAINTENANCE_INTERVAL = 30;
const MAPBOX_DIRECTIONS_BASE_URL =
  "https://api.mapbox.com/directions/v5/mapbox/driving";

const STATION_TYPES = {
  FIRE: { label: "Fire", icon: Flame },
  EMS: { label: "EMS", icon: Ambulance },
  POLICE: { label: "Police", icon: Shield },
} as const;

const VEHICLE_TYPES = {
  ENGINE: {
    label: "Engine",
    stationType: "FIRE",
    cost: 300,
    speedKmh: 55,
    icon: Flame,
  },
  LADDER: {
    label: "Ladder",
    stationType: "FIRE",
    cost: 420,
    speedKmh: 48,
    icon: Truck,
  },
  AMBULANCE: {
    label: "Ambulance",
    stationType: "EMS",
    cost: 250,
    speedKmh: 65,
    icon: Ambulance,
  },
  RESCUE: {
    label: "Rescue",
    stationType: "EMS",
    cost: 360,
    speedKmh: 62,
    icon: Siren,
  },
  PATROL: {
    label: "Patrol",
    stationType: "POLICE",
    cost: 220,
    speedKmh: 70,
    icon: Shield,
  },
  SWAT: {
    label: "SWAT",
    stationType: "POLICE",
    cost: 480,
    speedKmh: 58,
    icon: Shield,
  },
} as const;

const INCIDENT_TEMPLATES = [
  {
    title: "Structure Fire",
    category: "FIRE",
    unlockAt: 0,
    baseReward: 140,
    stages: [
      { label: "Fire Suppression", required: ["ENGINE"] },
      { label: "Patient Treatment", required: ["AMBULANCE"] },
      { label: "Traffic Control", required: ["PATROL"] },
    ],
  },
  {
    title: "Vehicle Entrapment",
    category: "EMS",
    unlockAt: 2,
    baseReward: 180,
    stages: [
      { label: "Extrication", required: ["LADDER", "RESCUE"] },
      { label: "Transport", required: ["AMBULANCE"] },
    ],
  },
  {
    title: "Active Threat",
    category: "POLICE",
    unlockAt: 5,
    baseReward: 220,
    stages: [
      { label: "Containment", required: ["PATROL", "SWAT"] },
      { label: "Medical Standby", required: ["AMBULANCE"] },
    ],
  },
] satisfies {
  title: string;
  category: IncidentCategory;
  unlockAt: number;
  baseReward: number;
  stages: IncidentStage[];
}[];

const initialState: GameState = {
  credits: 900,
  employees: 10,
  nextStationId: 1,
  nextVehicleId: 1,
  nextIncidentId: 1,
  resolvedCount: 0,
  stations: [],
  vehicles: [],
  incidents: [],
  log: ["Place your first building on the map to start the game."],
};

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function stationCapacity(_level: number) {
  return 2;
}

function starterVehicleType(stationType: StationType): VehicleType {
  if (stationType === "FIRE") return "ENGINE";
  if (stationType === "EMS") return "AMBULANCE";
  return "PATROL";
}

function loadGame(): GameState {
  if (typeof window === "undefined") return initialState;

  try {
    const saved = localStorage.getItem("emergency-services-save-v2");
    if (!saved) return initialState;

    const parsed = JSON.parse(saved) as GameState;
    return {
      ...parsed,
      employees: parsed.employees ?? 10,
      vehicles: parsed.vehicles.map((vehicle) => ({
        ...vehicle,
        route: Array.isArray(vehicle.route) ? vehicle.route : [],
      })),
    };
  } catch {
    return initialState;
  }
}

function saveGame(state: GameState) {
  localStorage.setItem("emergency-services-save-v2", JSON.stringify(state));
}

async function fetchRoadRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  token?: string,
) {
  if (!token) return null;

  const path = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const params = new URLSearchParams({
    alternatives: "false",
    geometries: "geojson",
    overview: "full",
    steps: "false",
    access_token: token,
  });

  try {
    const response = await fetch(`${MAPBOX_DIRECTIONS_BASE_URL}/${path}?${params.toString()}`);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      routes?: { distance: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates;

    if (!route || !coordinates || coordinates.length < 2) return null;

    return {
      distanceKm: route.distance / 1000,
      coordinates,
    };
  } catch {
    return null;
  }
}

function getRoutePosition(
  route: [number, number][],
  progress: number,
  fallback: { lat: number; lng: number },
) {
  if (route.length < 2) return [fallback.lng, fallback.lat] as [number, number];
  if (progress <= 0) return route[0];
  if (progress >= 1) return route[route.length - 1];

  const segmentProgress = progress * (route.length - 1);
  const fromIndex = Math.floor(segmentProgress);
  const toIndex = Math.min(route.length - 1, fromIndex + 1);
  const localProgress = segmentProgress - fromIndex;
  const from = route[fromIndex];
  const to = route[toIndex];

  return [
    from[0] + (to[0] - from[0]) * localProgress,
    from[1] + (to[1] - from[1]) * localProgress,
  ] as [number, number];
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "blue";
}) {
  const tones = {
    default: "bg-slate-700/40 text-slate-200 border-slate-500/50",
    good: "bg-emerald-600/20 text-emerald-300 border-emerald-500/40",
    warn: "bg-amber-500/20 text-amber-200 border-amber-400/40",
    bad: "bg-rose-500/20 text-rose-200 border-rose-400/40",
    blue: "bg-sky-500/20 text-sky-200 border-sky-400/40",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

const categoryColor: Record<IncidentCategory, string> = {
  FIRE: "bg-rose-500",
  EMS: "bg-emerald-500",
  POLICE: "bg-sky-500",
};

function formatSeconds(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function Page() {
  const [game, setGame] = useState<GameState>(() => loadGame());
  const [selectedBuild, setSelectedBuild] = useState<StationType>("FIRE");
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const stationMarkerRefs = useRef<mapboxgl.Marker[]>([]);
  const incidentMarkerRefs = useRef<mapboxgl.Marker[]>([]);
  const vehicleMarkerRefs = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

  useEffect(() => {
    saveGame(game);
  }, [game]);

  useEffect(() => {
    const autosave = setInterval(() => saveGame(game), 10000);
    return () => clearInterval(autosave);
  }, [game]);

  const activeIncidents = game.incidents.filter(
    (incident) => incident.status !== "COMPLETE",
  );
  const hasStarted = game.stations.length > 0;
  
  const completedIncidents = game.incidents.filter(
    (incident) => incident.status === "COMPLETE",
  );

  const buildStationAt = useCallback(
    (lat: number, lng: number, type: StationType) => {
      setGame((current) => {
        const isFirstStation = current.stations.length === 0;
        const buildCost = isFirstStation ? 0 : STATION_COST;
        if (current.credits < buildCost) return current;

        const id = current.nextStationId;
        const label = STATION_TYPES[type].label;

        const station: Station = {
          id,
          name: `${label} Station ${id}`,
          type,
          level: 1,
          lat,
          lng,
        };

        let nextVehicleId = current.nextVehicleId;
        let vehicles = current.vehicles;
        if (isFirstStation) {
          const starterType = starterVehicleType(type);
          vehicles = [
            ...current.vehicles,
            {
              id: nextVehicleId,
              name: `${VEHICLE_TYPES[starterType].label} ${nextVehicleId}`,
              type: starterType,
              stationId: id,
              status: "AVAILABLE",
              eta: 0,
              totalEta: 0,
              incidentId: null,
              route: [],
            },
            {
              id: nextVehicleId + 1,
              name: `${VEHICLE_TYPES[starterType].label} ${nextVehicleId + 1}`,
              type: starterType,
              stationId: id,
              status: "AVAILABLE",
              eta: 0,
              totalEta: 0,
              incidentId: null,
              route: [],
            },
          ];
          nextVehicleId += 2;
        }

        return {
          ...current,
          credits: current.credits - buildCost,
          nextStationId: id + 1,
          nextVehicleId,
          stations: [...current.stations, station],
          vehicles,
          log: [
            isFirstStation
              ? `Built ${station.name}. Game started with 2 ${VEHICLE_TYPES[starterVehicleType(type)].label.toLowerCase()}s and 10 employees.`
              : `Built ${station.name} at ${lat.toFixed(4)}, ${lng.toFixed(4)}.`,
            ...current.log,
          ].slice(0, 10),
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!mapContainerRef.current || !mapToken || mapRef.current) return;

    mapboxgl.accessToken = mapToken;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-122.43, 37.774],
      zoom: 11.2,
      attributionControl: false,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current.on("click", (event) => {
      buildStationAt(event.lngLat.lat, event.lngLat.lng, selectedBuild);
    });

    return () => {
      stationMarkerRefs.current.forEach((marker) => marker.remove());
      incidentMarkerRefs.current.forEach((marker) => marker.remove());
      vehicleMarkerRefs.current.forEach((marker) => marker.remove());
      stationMarkerRefs.current = [];
      incidentMarkerRefs.current = [];
      vehicleMarkerRefs.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapToken, selectedBuild, buildStationAt]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [isMapFullscreen]);

  useEffect(() => {
    if (!mapRef.current) return;

    stationMarkerRefs.current.forEach((marker) => marker.remove());
    incidentMarkerRefs.current.forEach((marker) => marker.remove());
    stationMarkerRefs.current = [];
    incidentMarkerRefs.current = [];

    game.stations.forEach((station) => {
      const el = document.createElement("div");
      el.className =
        "flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-950 bg-sky-500 text-[10px] font-black text-white shadow-lg";
      el.title = station.name;
      el.textContent =
        station.type === "FIRE" ? "F" : station.type === "EMS" ? "E" : "P";

      stationMarkerRefs.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([station.lng, station.lat])
          .addTo(mapRef.current!),
      );
    });

    activeIncidents.forEach((incident) => {
      const el = document.createElement("button");
      el.className = `flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-950 ${categoryColor[incident.category]} text-white shadow-lg`;
      el.title = `${incident.title} (${incident.stages[incident.currentStage]?.label ?? "Done"})`;
      el.innerHTML = "⚠";
      el.onclick = () => {
        alert(
          `${incident.title}\nSeverity ${incident.severity}\nStage: ${incident.stages[incident.currentStage]?.label ?? "Complete"}`,
        );
      };

      incidentMarkerRefs.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([incident.lng, incident.lat])
          .addTo(mapRef.current!),
      );
    });

    game.vehicles.forEach((vehicle) => {
      if (vehicle.status === "AVAILABLE") {
        vehicleMarkerRefs.current.get(vehicle.id)?.remove();
        vehicleMarkerRefs.current.delete(vehicle.id);
        return;
      }

      const station = game.stations.find((s) => s.id === vehicle.stationId);
      const incident = game.incidents.find((i) => i.id === vehicle.incidentId);
      if (!station || !incident) return;

      const progress =
        vehicle.totalEta <= 0 ? 1 : 1 - Math.max(vehicle.eta, 0) / vehicle.totalEta;
      const fallback = vehicle.status === "DISPATCHED" ? station : incident;
      const [lng, lat] = getRoutePosition(vehicle.route, progress, fallback);

      const existing = vehicleMarkerRefs.current.get(vehicle.id);
      if (existing) {
        existing.setLngLat([lng, lat]);
        return;
      }

      const el = document.createElement("div");
      el.className =
        "flex h-4 w-4 items-center justify-center rounded-full border border-white bg-yellow-300 text-[8px] font-bold text-slate-900";
      el.textContent = "V";
      el.title = vehicle.name;

      vehicleMarkerRefs.current.set(
        vehicle.id,
        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .addTo(mapRef.current!),
      );
    });
  }, [activeIncidents, game.incidents, game.stations, game.vehicles]);

  function spawnIncident() {
    setGame((current) => {
      const activeCount = current.incidents.filter(
        (incident) => incident.status !== "COMPLETE",
      ).length;
      const available = INCIDENT_TEMPLATES.filter(
        (template) => current.resolvedCount >= template.unlockAt,
      );
      if (available.length === 0 || current.stations.length === 0 || activeCount >= 2) return current;

      const station = current.stations[rand(0, current.stations.length - 1)];
      const template = available[rand(0, available.length - 1)];
      const difficulty = 1 + Math.floor(current.resolvedCount / 3);

      const lat = station.lat + (Math.random() - 0.5) * 0.04;
      const lng = station.lng + (Math.random() - 0.5) * 0.04;

      const incident: Incident = {
        id: current.nextIncidentId,
        title: template.title,
        category: template.category,
        severity: difficulty,
        reward: template.baseReward + difficulty * 35,
        lat,
        lng,
        status: "OPEN",
        currentStage: 0,
        stages: template.stages,
        assignedVehicleIds: [],
      };

      return {
        ...current,
        nextIncidentId: current.nextIncidentId + 1,
        incidents: [...current.incidents, incident],
        log: [`New ${incident.category} incident: ${incident.title}.`, ...current.log].slice(0, 10),
      };
    });
  }

  async function dispatch(vehicleId: number, incidentId: number) {
    const vehicle = game.vehicles.find((v) => v.id === vehicleId);
    const incident = game.incidents.find((i) => i.id === incidentId);
    if (!vehicle || !incident) return;

    const station = game.stations.find((s) => s.id === vehicle.stationId);
    if (!station) return;

    const route = await fetchRoadRoute(station, incident, mapToken);
    const km = route?.distanceKm ?? haversineKm(station, incident);
    const speed = VEHICLE_TYPES[vehicle.type].speedKmh;
    const eta = Math.max(8, Math.round((km / speed) * 3600));

    setGame((current) => {
      const vehicle = current.vehicles.find((v) => v.id === vehicleId);
      const incident = current.incidents.find((i) => i.id === incidentId);
      if (!vehicle || !incident || current.credits < DISPATCH_COST) return current;

      const station = current.stations.find((s) => s.id === vehicle.stationId);
      if (!station) return current;

      return {
        ...current,
        credits: current.credits - DISPATCH_COST,
        vehicles: current.vehicles.map((v) =>
          v.id === vehicleId
            ? {
                ...v,
                status: "DISPATCHED",
                eta,
                totalEta: eta,
                incidentId,
                route:
                  route?.coordinates ??
                  [
                    [station.lng, station.lat],
                    [incident.lng, incident.lat],
                  ],
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
          `Dispatched ${vehicle.name} to ${incident.title}. ETA ${eta}s (${km.toFixed(1)} km${route ? ", routed" : ", direct"}).`,
          ...current.log,
        ].slice(0, 10),
      };
    });
  }

  function buyVehicle(type: VehicleType) {
    setGame((current) => {
      const config = VEHICLE_TYPES[type];
      const possibleStations = current.stations.filter(
        (station) => station.type === config.stationType,
      );

      const station = possibleStations.find((candidate) => {
        const used = current.vehicles.filter((v) => v.stationId === candidate.id).length;
        return used < stationCapacity(candidate.level);
      });

      if (!station || current.credits < config.cost) return current;

      const id = current.nextVehicleId;
      const vehicle: Vehicle = {
        id,
        name: `${config.label} ${id}`,
        type,
        stationId: station.id,
        status: "AVAILABLE",
        eta: 0,
        totalEta: 0,
        incidentId: null,
        route: [],
      };

      return {
        ...current,
        credits: current.credits - config.cost,
        nextVehicleId: id + 1,
        vehicles: [...current.vehicles, vehicle],
        log: [`Purchased ${vehicle.name} for ${station.name}.`, ...current.log].slice(0, 10),
      };
    });
  }

  function upgradeStation(stationId: number) {
    setGame((current) => {
      const station = current.stations.find((s) => s.id === stationId);
      if (!station) return current;
      const cost = 260 + station.level * 200;
      if (current.credits < cost) return current;

      return {
        ...current,
        credits: current.credits - cost,
        stations: current.stations.map((item) =>
          item.id === stationId ? { ...item, level: item.level + 1 } : item,
        ),
        log: [`Upgraded ${station.name} to level ${station.level + 1}.`, ...current.log].slice(0, 10),
      };
    });
  }

  function resetGame() {
    localStorage.removeItem("emergency-services-save-v2");
    setGame(initialState);
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((current) => {
        let creditsEarned = 0;
        const progressNotes: string[] = [];

        let nextVehicles = current.vehicles.map((vehicle) => {
          if (
            (vehicle.status === "DISPATCHED" || vehicle.status === "RETURNING") &&
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
              totalEta: 0,
              route: [],
            };
          }

          return vehicle;
        });

        const nextIncidents = current.incidents.map((incident) => {
          if (incident.status === "COMPLETE") return incident;
          const stage = incident.stages[incident.currentStage];
          if (!stage) return incident;

          const assignedVehicles = incident.assignedVehicleIds
            .map((id) => nextVehicles.find((v) => v.id === id))
            .filter((v): v is Vehicle => Boolean(v));

          const hasAllRequired = stage.required.every((requiredType) =>
            assignedVehicles.some(
              (vehicle) =>
                vehicle.type === requiredType &&
                vehicle.status === "DISPATCHED" &&
                vehicle.eta <= 0,
            ),
          );

          if (!hasAllRequired) return incident;

          const nextStage = incident.currentStage + 1;
          if (nextStage >= incident.stages.length) {
            creditsEarned += incident.reward;
            progressNotes.push(`${incident.title} completed (+${incident.reward}).`);

            const assignedIds = new Set(incident.assignedVehicleIds);
            nextVehicles = nextVehicles.map((vehicle) => {
              if (!assignedIds.has(vehicle.id)) return vehicle;
              const station = current.stations.find((s) => s.id === vehicle.stationId);
              if (!station) return vehicle;
              const returnKm = haversineKm(station, incident);
              const returnEta = Math.max(
                8,
                Math.round((returnKm / VEHICLE_TYPES[vehicle.type].speedKmh) * 3600),
              );

              return {
                ...vehicle,
                status: "RETURNING" as VehicleStatus,
                incidentId: incident.id,
                eta: returnEta,
                totalEta: returnEta,
                route:
                  vehicle.route.length >= 2
                    ? [...vehicle.route].reverse()
                    : [
                        [incident.lng, incident.lat],
                        [station.lng, station.lat],
                      ],
              };
            });

            return {
              ...incident,
              status: "COMPLETE" as IncidentStatus,
            };
          }

          progressNotes.push(`${incident.title}: moved to stage ${nextStage + 1}.`);
          return {
            ...incident,
            currentStage: nextStage,
          };
        });

        const activeCount = nextIncidents.filter(
          (incident) => incident.status !== "COMPLETE",
        ).length;

        const shouldSpawn =
          current.stations.length > 0 &&
          (activeCount < 1 || (Math.random() < 0.08 && activeCount < 2));

        let finalIncidents = nextIncidents;
        let nextIncidentId = current.nextIncidentId;
        let nextResolvedCount = current.resolvedCount;
        let nextCredits = current.credits + creditsEarned;

        if (creditsEarned > 0) {
          nextResolvedCount += nextIncidents.filter((i) => i.status === "COMPLETE").length - current.incidents.filter((i) => i.status === "COMPLETE").length;
        }

        if (current.nextIncidentId > 0 && current.nextIncidentId % MAINTENANCE_INTERVAL === 0) {
          const maintenance = current.vehicles.length * 4;
          nextCredits -= maintenance;
          progressNotes.unshift(`Maintenance costs paid: ${maintenance}.`);
        }

        if (shouldSpawn) {
          const available = INCIDENT_TEMPLATES.filter(
            (template) => nextResolvedCount >= template.unlockAt,
          );
          if (available.length > 0) {
            const station = current.stations[rand(0, current.stations.length - 1)];
            const template = available[rand(0, available.length - 1)];
            const difficulty = 1 + Math.floor(nextResolvedCount / 3);
            const incident: Incident = {
              id: nextIncidentId,
              title: template.title,
              category: template.category,
              severity: difficulty,
              reward: template.baseReward + difficulty * 35,
              lat: station.lat + (Math.random() - 0.5) * 0.04,
              lng: station.lng + (Math.random() - 0.5) * 0.04,
              status: "OPEN",
              currentStage: 0,
              stages: template.stages,
              assignedVehicleIds: [],
            };
            nextIncidentId += 1;
            finalIncidents = [...finalIncidents, incident];
            progressNotes.unshift(`New incident: ${incident.title}.`);
          }
        }

        return {
          ...current,
          credits: nextCredits,
          resolvedCount: nextResolvedCount,
          nextIncidentId,
          vehicles: nextVehicles,
          incidents: finalIncidents,
          log: [...progressNotes, ...current.log].slice(0, 10),
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const stationUsage = useMemo(() => {
    return Object.fromEntries(
      game.stations.map((station) => [
        station.id,
        game.vehicles.filter((vehicle) => vehicle.stationId === station.id).length,
      ]),
    );
  }, [game.stations, game.vehicles]);

  return (
    <main className="min-h-screen bg-[#0b1727] p-4 text-slate-100">
      <div className="mx-auto max-w-[1450px] space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-[#2b3b52] bg-[#12233a] p-5 shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Emergency Services</h1>
            <p className="text-sm text-slate-400">
              Click map to build stations, dispatch by real distance, and clear staged incidents.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good">
              <Coins className="mr-1 h-3 w-3" />
              {game.credits} credits
            </Badge>
            <Badge>{game.employees} employees</Badge>

            <Badge tone="blue">
              <Radio className="mr-1 h-3 w-3" />
              {activeIncidents.length} open calls
            </Badge>

            <Badge>{completedIncidents.length} closed</Badge>

            <Button onClick={spawnIncident} disabled={!hasStarted || activeIncidents.length >= 2}>
              Create Call
            </Button>

            <Button variant="outline" onClick={resetGame}>
              Reset
            </Button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Card
            className={`${isMapFullscreen ? "fixed inset-3 z-50" : ""} border-[#2b3b52] bg-[#12233a] text-slate-100`}
          >
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-bold">City Map</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Mapbox live map</span>
                  <Button variant="outline" size="sm" onClick={() => setIsMapFullscreen((s) => !s)}>
                    {isMapFullscreen ? <Shrink className="mr-1 h-4 w-4" /> : <Expand className="mr-1 h-4 w-4" />}
                    {isMapFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  </Button>
                </div>
              </div>

              {mapToken ? (
                <div
                  ref={mapContainerRef}
                  className={`${isMapFullscreen ? "h-[calc(100vh-7rem)]" : "h-[560px]"} w-full rounded-2xl border border-slate-800`}                
                />
              ) : (
                <div className="rounded-2xl border border-amber-700 bg-amber-900/30 p-4 text-sm text-amber-100">
                  Add <code>VITE_MAPBOX_TOKEN</code> in your <code>.env</code> file to enable the live map.
                </div>
              )}
            </CardContent>
          </Card>

          {!isMapFullscreen && (
            <div className="space-y-4">
              <Card className="border-[#2b3b52] bg-[#12233a] text-slate-100">
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

                  <p className="text-xs text-slate-400">
                    {hasStarted
                      ? `Click anywhere on map to build a ${STATION_TYPES[selectedBuild].label} station (${STATION_COST} credits).`
                      : `Place your first ${STATION_TYPES[selectedBuild].label} building for free to start. It begins with 2 vehicles and 10 employees.`}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-[#2b3b52] bg-[#12233a] text-slate-100">
                <CardContent className="space-y-3 p-4">
                  <h2 className="text-xl font-bold">Buy Vehicles</h2>

                  <div className="grid gap-2 sm:grid-cols-2">
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
          )}
        </section>

        {!isMapFullscreen && (
          <section className="grid gap-4 lg:grid-cols-3">
            <Panel title="Active Incidents">
              {activeIncidents.length === 0 ? (
                <p className="text-sm text-slate-400">No active incidents.</p>
              ) : (
                activeIncidents.map((incident) => {
                  const stage = incident.stages[incident.currentStage];

                  return (
                    <div
                      key={incident.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold">{incident.title}</h3>
                          <p className="text-xs text-slate-400">
                            {incident.lat.toFixed(4)},{incident.lng.toFixed(4)} • Reward {incident.reward} • Sev {incident.severity}
                          </p>
                        </div>

                        <Badge tone={incident.status === "OPEN" ? "warn" : "blue"}>
                          {incident.status}
                        </Badge>
                      </div>

                      <p className="mt-2 text-xs text-slate-300">
                        Stage {incident.currentStage + 1}/{incident.stages.length}: {stage?.label}
                      </p>

                      <p className="mt-1 text-xs text-slate-300">Required: {stage?.required.join(", ")}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {[...new Set(stage?.required ?? [])].map((type) => {
                          const alreadyAssigned = incident.assignedVehicleIds.some(
                            (id) =>
                              game.vehicles.find((v) => v.id === id)?.type === type,
                          );

                          const match = game.vehicles.find(
                            (v) => v.status === "AVAILABLE" && v.type === type,
                          );

                          return (
                            <Button
                              key={`${incident.id}-${type}`}
                              size="sm"
                              disabled={alreadyAssigned || !match || game.credits < DISPATCH_COST}
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
                  );
                })
              )}
            </Panel>

            <Panel title="Fleet">
              {game.vehicles.map((vehicle) => {
                const Icon = VEHICLE_TYPES[vehicle.type].icon;
                const pct =
                  vehicle.totalEta > 0
                    ? Math.min(100, Math.max(0, Math.round(((vehicle.totalEta - vehicle.eta) / vehicle.totalEta) * 100)))
                    : 0;

                return (
                  <div
                    key={vehicle.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950 p-3"
                  >
                    <div className="flex items-center justify-between">
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

                        {vehicle.eta > 0 && <p className="mt-1 text-xs text-slate-400">ETA {formatSeconds(vehicle.eta)}</p>}
                      </div>
                    </div>

                    {vehicle.status !== "AVAILABLE" && (
                      <div className="mt-2 h-1.5 w-full rounded bg-slate-800">
                        <div className="h-1.5 rounded bg-cyan-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </Panel>

            <Panel title="Stations & Log">
              <div className="space-y-2">
                {game.stations.map((station) => {
                  const Icon = STATION_TYPES[station.type].icon;
                  const upgradeCost = 260 + station.level * 200;
                  const used = stationUsage[station.id] ?? 0;
                  const capacity = stationCapacity(station.level);

                  return (
                    <div
                      key={station.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5" />

                          <div>
                            <p className="font-semibold">{station.name}</p>
                            <p className="text-xs text-slate-400">
                              {station.type} • Level {station.level} • {used}/{capacity} vehicles
                            </p>
                            <p className="text-xs text-slate-500">
                              {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
                            </p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={game.credits < upgradeCost}
                          onClick={() => upgradeStation(station.id)}
                        >
                          Upgrade {upgradeCost}
                        </Button>
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
        )}
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
