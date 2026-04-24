"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Ambulance,
  CarFront,
  Coins,
  Flame,
  House,
  Radio,
  Shield,
  Siren,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";

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

const STARTER_INCIDENT_TEMPLATES = [
  {
    title: "Small Kitchen Fire",
    category: "FIRE",
    baseReward: 120,
    stages: [{ label: "Initial Attack", required: ["ENGINE"] }],
  },
  {
    title: "Medical Emergency",
    category: "EMS",
    baseReward: 120,
    stages: [{ label: "Patient Care", required: ["AMBULANCE"] }],
  },
  {
    title: "Public Disturbance",
    category: "POLICE",
    baseReward: 120,
    stages: [{ label: "On-scene Response", required: ["PATROL"] }],
  },
] satisfies {
  title: string;
  category: IncidentCategory;
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

function stationCapacity(level: number) {
  void level;
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

function nudgePointToward(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  meters = 40,
) {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const length = Math.hypot(dLat, dLng);
  if (length === 0) return [from.lng, from.lat] as [number, number];

  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng =
    Math.max(0.0001, Math.cos((from.lat * Math.PI) / 180)) * 111_320;
  const unitLat = dLat / length;
  const unitLng = dLng / length;
  const latOffset = (unitLat * meters) / metersPerDegreeLat;
  const lngOffset = (unitLng * meters) / metersPerDegreeLng;

  return [from.lng + lngOffset, from.lat + latOffset] as [number, number];
}

export default function Page() {
  const [game, setGame] = useState<GameState>(() => loadGame());
  const [selectedBuild, setSelectedBuild] = useState<StationType>("FIRE");
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
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
    if (!mapRef.current) return;

    stationMarkerRefs.current.forEach((marker) => marker.remove());
    incidentMarkerRefs.current.forEach((marker) => marker.remove());
    stationMarkerRefs.current = [];
    incidentMarkerRefs.current = [];

    game.stations.forEach((station) => {
      const el = document.createElement("div");
      el.className = "relative flex h-10 w-10 items-start justify-center";
      el.title = station.name;
      const color =
        station.type === "FIRE"
          ? "rgba(244,63,94,0.95)"
          : station.type === "EMS"
            ? "rgba(16,185,129,0.95)"
            : "rgba(14,165,233,0.95)";
      const label =
        station.type === "FIRE" ? "🚒" : station.type === "EMS" ? "🏥" : "🏢";
      el.innerHTML = `
        <div style="position:relative;display:flex;height:30px;width:30px;align-items:center;justify-content:center;border-radius:8px;border:2px solid rgba(15,23,42,0.95);background:${color};box-shadow:0 4px 10px rgba(15,23,42,0.5);font-size:15px;">
          ${label}
        </div>
        <div style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid ${color};filter:drop-shadow(0 2px 2px rgba(15,23,42,0.6));"></div>
      `;
      el.onclick = () => setSelectedStationId(station.id);

      stationMarkerRefs.current.push(
        new mapboxgl.Marker({ element: el, anchor: "bottom" })
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
      const shouldRenderVehicle =
        vehicle.status === "DISPATCHED" &&
        vehicle.eta > 0 &&
        vehicle.incidentId !== null;

      if (!shouldRenderVehicle) {
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
      const color =
        vehicle.type === "ENGINE" || vehicle.type === "LADDER"
          ? "rgba(249,115,22,0.95)"
          : vehicle.type === "AMBULANCE" || vehicle.type === "RESCUE"
            ? "rgba(34,197,94,0.95)"
            : "rgba(14,165,233,0.95)";
      const icon =
        vehicle.type === "ENGINE" || vehicle.type === "LADDER"
          ? "🚒"
          : vehicle.type === "AMBULANCE"
            ? "🚑"
            : vehicle.type === "RESCUE"
              ? "🚐"
              : "🚓";
      el.className = "relative flex h-8 w-8 items-start justify-center";
      el.innerHTML = `
        <div style="position:relative;display:flex;height:23px;width:23px;align-items:center;justify-content:center;border-radius:7px;border:2px solid rgba(15,23,42,0.95);background:${color};box-shadow:0 4px 10px rgba(15,23,42,0.5);font-size:12px;">
          ${icon}
        </div>
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${color};filter:drop-shadow(0 2px 2px rgba(15,23,42,0.6));"></div>
      `;
      el.title = vehicle.name;

      vehicleMarkerRefs.current.set(
        vehicle.id, new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(mapRef.current!),
      );
    });
  }, [activeIncidents, game.incidents, game.stations, game.vehicles]);

  const chooseIncidentTemplates = useCallback((state: GameState) => {
    if (state.stations.length !== 1) {
      return INCIDENT_TEMPLATES.filter(
        (template) => state.resolvedCount >= template.unlockAt,
      );
    }

    const availableTypes = new Set(state.vehicles.map((vehicle) => vehicle.type));
    return STARTER_INCIDENT_TEMPLATES.filter((template) =>
      template.stages[0].required.every((requiredType) => availableTypes.has(requiredType)),
    );
  }, []);
  
  function spawnIncident() {
    setGame((current) => {
      const activeCount = current.incidents.filter(
        (incident) => incident.status !== "COMPLETE",
      ).length;
      const available = chooseIncidentTemplates(current);
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

    const roadStart = nudgePointToward(station, incident);
    const roadRoute = route
      ? ([roadStart, ...route.coordinates.slice(1)] as [number, number][])
      : null;

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
                  roadRoute ??
                  [
                    roadStart,
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
          const available = chooseIncidentTemplates({
            ...current,
            resolvedCount: nextResolvedCount,
            incidents: finalIncidents,
            nextIncidentId,
          });
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
  }, [chooseIncidentTemplates]);

  const stationEmployees = useMemo(() => {
    if (game.stations.length === 0) return {} as Record<number, number>;
    const base = Math.floor(game.employees / game.stations.length);
    const remainder = game.employees % game.stations.length;

    return Object.fromEntries(
      game.stations.map((station, index) => [
        station.id,
        base + (index < remainder ? 1 : 0),
      ]),
    );
  }, [game.employees, game.stations]);

  const selectedStation =
    (selectedStationId && game.stations.find((station) => station.id === selectedStationId)) ??
    null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b1727] text-slate-100">
      {mapToken ? (
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute left-4 top-4 z-40 max-w-md rounded-xl border border-amber-700 bg-amber-900/80 p-4 text-sm text-amber-100">
          Add <code>VITE_MAPBOX_TOKEN</code> in your <code>.env</code> file to enable the live map.
        </div>
      )}

      <div className="absolute left-3 top-3 z-30 w-[320px] space-y-2 rounded-2xl border border-slate-700/70 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-sm">
        <h1 className="text-base font-black tracking-tight">Emergency Services</h1>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="good">
            <Coins className="mr-1 h-3 w-3" />
            {game.credits}
          </Badge>
          <Badge>{game.employees} staff</Badge>
          <Badge tone="blue">
            <Radio className="mr-1 h-3 w-3" />
            {activeIncidents.length} open
          </Badge>
          <Badge>{completedIncidents.length} closed</Badge>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Build</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATION_TYPES) as StationType[]).map((type) => {
              const Icon = STATION_TYPES[type].icon;
              return (
                <Button
                  key={type}
                  size="sm"
                  variant={selectedBuild === type ? "default" : "outline"}
                  onClick={() => setSelectedBuild(type)}
                >
                  <House className="mr-1 h-3.5 w-3.5" />
                  <Icon className="mr-1 h-3.5 w-3.5" />
                  {STATION_TYPES[type].label}
                </Button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            {hasStarted
              ? `Click map to place a ${STATION_TYPES[selectedBuild].label} building (${STATION_COST} credits).`
              : `Place your first ${STATION_TYPES[selectedBuild].label} building free.`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Vehicles</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((type) => {
              const Icon =
                type === "ENGINE" || type === "LADDER"
                  ? Truck
                  : type === "PATROL" || type === "SWAT"
                    ? CarFront
                    : type === "AMBULANCE"
                      ? Ambulance
                      : Siren;
              return (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  onClick={() => buyVehicle(type)}
                  disabled={game.credits < VEHICLE_TYPES[type].cost}
                >
                  <Icon className="mr-1 h-3.5 w-3.5" />
                  {VEHICLE_TYPES[type].label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1" onClick={spawnIncident} disabled={!hasStarted || activeIncidents.length >= 2}>
            Create Call
          </Button>
          <Button size="sm" variant="outline" onClick={resetGame}>
            Reset
          </Button>
        </div>
      </div>

       <div className="absolute bottom-3 right-3 z-30 max-h-[52vh] w-[360px] space-y-2 overflow-y-auto rounded-2xl border border-slate-700/70 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-sm">
        <h2 className="text-sm font-bold">Live Incidents</h2>
        {activeIncidents.length === 0 ? (
          <p className="text-xs text-slate-400">No active incidents.</p>
        ) : (
          activeIncidents.map((incident) => {
            const stage = incident.stages[incident.currentStage];
            return (
              <div key={incident.id} className="rounded-xl border border-slate-700 bg-slate-900/90 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{incident.title}</p>
                    <p className="text-[11px] text-slate-400">{stage?.label} • reward {incident.reward}</p>
                  </div>
                  <Badge tone={incident.status === "OPEN" ? "warn" : "blue"}>{incident.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...new Set(stage?.required ?? [])].map((type) => {
                    const alreadyAssigned = incident.assignedVehicleIds.some(
                      (id) => game.vehicles.find((v) => v.id === id)?.type === type,
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
                        {alreadyAssigned ? `${type} sent` : match ? `Send ${type}` : `No ${type}`}
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {selectedStation && (
          <div className="rounded-xl border border-sky-700/60 bg-sky-950/40 p-2">
            <p className="text-xs font-semibold">{selectedStation.name}</p>
            <p className="text-[11px] text-slate-300">Employees: {stationEmployees[selectedStation.id] ?? 0}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={game.credits < 260 + selectedStation.level * 200}
              onClick={() => upgradeStation(selectedStation.id)}
            >
              Upgrade ({260 + selectedStation.level * 200})
            </Button>
          </div>
        )}

        <div className="space-y-1">
          {game.log.slice(0, 4).map((entry, index) => (
            <p key={`${entry}-${index}`} className="rounded-lg bg-slate-900/90 p-2 text-[11px] text-slate-300">
              {entry}
            </p>
          ))}
        </div>
      </div>
    </main>
  );
}