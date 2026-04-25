"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Ambulance,
  CarFront,
  Clock3,
  Coins,
  Flame,
  Globe2,
  House,
  Radio,
  Shield,
  Siren,
  Truck,
  UserPlus,
  Users,
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

type RealStationSite = {
  id: string;
  name: string;
  type: StationType;
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
  stageWorkRemaining: number;
  stageWorkTotal: number;
  filingRemaining: number;
  filingTotal: number;
};

type MissionDefinition = {
  id: string;
  name: string;
  average_credits: number;
  requirements: Partial<Record<string, number>>;
  prerequisites: Partial<Record<string, number>>;
  mission_categories: string[];
};

type SpawnableMission = {
  title: string;
  category: IncidentCategory;
  baseReward: number;
  stages: IncidentStage[];
};

type GameState = {
  credits: number;
  employees: number;
  homeCountryCode: string;
  activeCountryCode: string;
  unlockedCountryCodes: string[];
  nextStationId: number;
  nextVehicleId: number;
  nextIncidentId: number;
  resolvedCount: number;
  stations: Station[];
  vehicles: Vehicle[];
  incidents: Incident[];
  log: string[];
};

const STATION_COST = 120000;
const DISPATCH_COST = 90;
const UPGRADE_BASE_COST = 75000;
const HIRING_COST = 1600;
const PAYROLL_PER_EMPLOYEE = 45;
const COUNTRY_LICENSE_COST = 300000;
const STAGE_WORK_SECONDS = 20;
const FILING_SECONDS = 10;
const MAPBOX_DIRECTIONS_BASE_URL =
  "https://api.mapbox.com/directions/v5/mapbox/driving";

const STATION_TYPES = {
  FIRE: { label: "Fire", icon: Flame },
  EMS: { label: "EMS", icon: Ambulance },
  POLICE: { label: "Police", icon: Shield },
} as const;

type EuCountry = {
  code: string;
  name: string;
  center: [number, number];
  zoom: number;
  bounds: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
};

const EU_COUNTRIES: EuCountry[] = [
  { code: "AT", name: "Austria", center: [14.2, 47.6], zoom: 6.5, bounds: { minLng: 9.4, maxLng: 17.2, minLat: 46.2, maxLat: 49.1 } },
  { code: "BE", name: "Belgium", center: [4.6, 50.8], zoom: 7.5, bounds: { minLng: 2.4, maxLng: 6.4, minLat: 49.4, maxLat: 51.7 } },
  { code: "BG", name: "Bulgaria", center: [25.3, 42.8], zoom: 6.4, bounds: { minLng: 22.3, maxLng: 28.7, minLat: 41.2, maxLat: 44.3 } },
  { code: "HR", name: "Croatia", center: [16.8, 45.2], zoom: 6.5, bounds: { minLng: 13.4, maxLng: 19.5, minLat: 42.2, maxLat: 46.6 } },
  { code: "CY", name: "Cyprus", center: [33.0, 35.1], zoom: 8.2, bounds: { minLng: 32.0, maxLng: 34.9, minLat: 34.4, maxLat: 35.8 } },
  { code: "CZ", name: "Czechia", center: [15.5, 49.9], zoom: 6.8, bounds: { minLng: 12.0, maxLng: 18.9, minLat: 48.5, maxLat: 51.1 } },
  { code: "DK", name: "Denmark", center: [10.0, 56.1], zoom: 6.7, bounds: { minLng: 7.8, maxLng: 12.7, minLat: 54.5, maxLat: 57.8 } },
  { code: "EE", name: "Estonia", center: [25.4, 58.7], zoom: 6.8, bounds: { minLng: 21.7, maxLng: 28.2, minLat: 57.5, maxLat: 59.8 } },
  { code: "FI", name: "Finland", center: [25.7, 64.3], zoom: 4.8, bounds: { minLng: 20.5, maxLng: 31.8, minLat: 59.7, maxLat: 70.2 } },
  { code: "FR", name: "France", center: [2.4, 46.3], zoom: 5.2, bounds: { minLng: -5.3, maxLng: 9.8, minLat: 41.1, maxLat: 51.2 } },
  { code: "DE", name: "Germany", center: [10.4, 51.1], zoom: 5.8, bounds: { minLng: 5.8, maxLng: 15.1, minLat: 47.1, maxLat: 55.1 } },
  { code: "GR", name: "Greece", center: [22.8, 39.1], zoom: 6, bounds: { minLng: 19.4, maxLng: 28.3, minLat: 34.6, maxLat: 41.9 } },
  { code: "HU", name: "Hungary", center: [19.3, 47.1], zoom: 7, bounds: { minLng: 16.0, maxLng: 22.9, minLat: 45.7, maxLat: 48.7 } },
  { code: "IE", name: "Ireland", center: [-8.2, 53.3], zoom: 6.2, bounds: { minLng: -10.8, maxLng: -5.3, minLat: 51.4, maxLat: 55.5 } },
  { code: "IT", name: "Italy", center: [12.7, 42.9], zoom: 5.5, bounds: { minLng: 6.6, maxLng: 18.7, minLat: 36.6, maxLat: 47.2 } },
  { code: "LV", name: "Latvia", center: [24.9, 56.9], zoom: 7, bounds: { minLng: 20.9, maxLng: 28.3, minLat: 55.6, maxLat: 58.1 } },
  { code: "LT", name: "Lithuania", center: [23.8, 55.3], zoom: 7, bounds: { minLng: 20.9, maxLng: 26.9, minLat: 53.9, maxLat: 56.6 } },
  { code: "LU", name: "Luxembourg", center: [6.1, 49.8], zoom: 8.4, bounds: { minLng: 5.7, maxLng: 6.6, minLat: 49.4, maxLat: 50.2 } },
  { code: "MT", name: "Malta", center: [14.4, 35.9], zoom: 10, bounds: { minLng: 14.1, maxLng: 14.7, minLat: 35.8, maxLat: 36.1 } },
  { code: "NL", name: "Netherlands", center: [5.3, 52.2], zoom: 7, bounds: { minLng: 3.2, maxLng: 7.3, minLat: 50.6, maxLat: 53.7 } },
  { code: "PL", name: "Poland", center: [19.2, 52.1], zoom: 6, bounds: { minLng: 14.1, maxLng: 24.2, minLat: 49.0, maxLat: 54.9 } },
  { code: "PT", name: "Portugal", center: [-8.0, 39.7], zoom: 6, bounds: { minLng: -9.6, maxLng: -6.1, minLat: 36.8, maxLat: 42.2 } },
  { code: "RO", name: "Romania", center: [24.9, 45.9], zoom: 6.2, bounds: { minLng: 20.2, maxLng: 29.8, minLat: 43.6, maxLat: 48.3 } },
  { code: "SK", name: "Slovakia", center: [19.5, 48.7], zoom: 7, bounds: { minLng: 16.8, maxLng: 22.8, minLat: 47.7, maxLat: 49.7 } },
  { code: "SI", name: "Slovenia", center: [14.9, 46.1], zoom: 7.6, bounds: { minLng: 13.3, maxLng: 16.6, minLat: 45.4, maxLat: 46.9 } },
  { code: "ES", name: "Spain", center: [-3.7, 40.3], zoom: 5.5, bounds: { minLng: -9.4, maxLng: 3.4, minLat: 35.8, maxLat: 43.9 } },
  { code: "SE", name: "Sweden", center: [16.0, 62.0], zoom: 4.6, bounds: { minLng: 11.0, maxLng: 24.2, minLat: 55.3, maxLat: 69.2 } },
];

const VEHICLE_TYPES = {
  ENGINE: {
    label: "Engine",
    stationType: "FIRE",
    cost: 75000,
    speedKmh: 55,
    crew: 4,
    icon: Flame,
  },
  LADDER: {
    label: "Ladder",
    stationType: "FIRE",
    cost: 120000,
    speedKmh: 48,
    crew: 5,
    icon: Truck,
  },
  AMBULANCE: {
    label: "Ambulance",
    stationType: "EMS",
    cost: 190000,
    speedKmh: 65,
    crew: 2,
    icon: Ambulance,
  },
  RESCUE: {
    label: "Rescue",
    stationType: "EMS",
    cost: 140000,
    speedKmh: 62,
    crew: 3,
    icon: Siren,
  },
  PATROL: {
    label: "Patrol",
    stationType: "POLICE",
    cost: 45000,
    speedKmh: 70,
    crew: 1,
    icon: Shield,
  },
  SWAT: {
    label: "SWAT",
    stationType: "POLICE",
    cost: 90000,
    speedKmh: 58,
    crew: 4,
    icon: Shield,
  },
} as const;
const DISABLED_VEHICLE_TYPES: VehicleType[] = ["LADDER"];

const initialState: GameState = {
  credits: 250000,
  employees: 10,
  homeCountryCode: "DE",
  activeCountryCode: "DE",
  unlockedCountryCodes: [],
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
  return 4 + (level - 1) * 2;
}

function starterVehicleType(stationType: StationType): VehicleType {
  if (stationType === "FIRE") return "ENGINE";
  if (stationType === "EMS") return "AMBULANCE";
  return "PATROL";
}

const REQUIREMENT_TO_VEHICLE: Record<string, VehicleType> = {
  firetrucks: "ENGINE",
  platform_trucks: "LADDER",
  ambulances: "AMBULANCE",
  rescue_vehicles: "RESCUE",
  police_cars: "PATROL",
  swat: "SWAT",
};

const MISSION_CATEGORY_TO_INCIDENT: Record<string, IncidentCategory> = {
  fire: "FIRE",
  ems: "EMS",
  police: "POLICE",
};

function missionToTemplate(mission: MissionDefinition): SpawnableMission | null {
  const requiredTypes = Object.entries(mission.requirements)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([key]) => REQUIREMENT_TO_VEHICLE[key])
    .filter((vehicleType): vehicleType is VehicleType => Boolean(vehicleType));
  if (requiredTypes.length === 0) return null;

  const category = mission.mission_categories
    .map((value) => MISSION_CATEGORY_TO_INCIDENT[value])
    .find((value): value is IncidentCategory => Boolean(value));
  if (!category) return null;

  return {
    title: mission.name,
    category,
    baseReward: mission.average_credits,
    stages: [{ label: "Primary Response", required: [...new Set(requiredTypes)] }],
  };
}

function findCountry(code: string) {
  return EU_COUNTRIES.find((country) => country.code === code) ?? EU_COUNTRIES[0];
}

function loadGame(): GameState {
  if (typeof window === "undefined") return initialState;

  try {
    const saved = localStorage.getItem("emergency-services-save-v2");
    if (!saved) return initialState;

    const parsed = JSON.parse(saved) as GameState;
    const homeCountryCode = parsed.homeCountryCode ?? "DE";
    const activeCountryCode = parsed.activeCountryCode ?? homeCountryCode;
    const unlockedCountryCodes = Array.isArray(parsed.unlockedCountryCodes)
      ? parsed.unlockedCountryCodes
      : [homeCountryCode];

    return {
      ...parsed,
      employees: parsed.employees ?? 10,
      homeCountryCode,
      activeCountryCode,
      unlockedCountryCodes: unlockedCountryCodes.includes(homeCountryCode)
        ? unlockedCountryCodes
        : [homeCountryCode, ...unlockedCountryCodes],
      incidents: parsed.incidents.map((incident) => ({
        ...incident,
        stageWorkRemaining: incident.stageWorkRemaining ?? STAGE_WORK_SECONDS,
        stageWorkTotal: incident.stageWorkTotal ?? STAGE_WORK_SECONDS,
        filingRemaining: incident.filingRemaining ?? FILING_SECONDS,
        filingTotal: incident.filingTotal ?? FILING_SECONDS,
      })),
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
    const response = await fetch(
      `${MAPBOX_DIRECTIONS_BASE_URL}/${path}?${params.toString()}`,
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      routes?: {
        distance: number;
        geometry?: { coordinates?: [number, number][] };
      }[];
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
  const [missionCatalog, setMissionCatalog] = useState<MissionDefinition[]>([]);
  const [requiresCountrySelection, setRequiresCountrySelection] = useState(
    () => loadGame().stations.length === 0,
  );
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countryPickerMode, setCountryPickerMode] = useState<"initial" | "manage">(
    "initial",
  );
  const [selectedBuild, setSelectedBuild] = useState<StationType>("FIRE");
  const [buildPickerOpen, setBuildPickerOpen] = useState(false);
  const [isSelectingRealStation, setIsSelectingRealStation] = useState(false);
  const [realStations, setRealStations] = useState<RealStationSite[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(
    null,
  );
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const stationMarkerRefs = useRef<mapboxgl.Marker[]>([]);
  const incidentMarkerRefs = useRef<mapboxgl.Marker[]>([]);
  const realStationMarkerRefs = useRef<mapboxgl.Marker[]>([]);
  const vehicleMarkerRefs = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const routeLayerIdsRef = useRef<string[]>([]);
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  const activeCountry = findCountry(game.activeCountryCode);

  const isWithinCountryBounds = useCallback(
    (lat: number, lng: number, countryCode: string) => {
      const country = findCountry(countryCode);
      return (
        lat >= country.bounds.minLat &&
        lat <= country.bounds.maxLat &&
        lng >= country.bounds.minLng &&
        lng <= country.bounds.maxLng
      );
    },
    [],
  );

  const flyToCountry = useCallback((countryCode: string) => {
    const country = findCountry(countryCode);
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: country.center,
      zoom: country.zoom,
      essential: true,
    });
  }, []);

  useEffect(() => {
    saveGame(game);
  }, [game]);

  useEffect(() => {
    const autosave = setInterval(() => saveGame(game), 10000);
    return () => clearInterval(autosave);
  }, [game]);

  useEffect(() => {
    let mounted = true;

    const loadMissionsForCountry = async () => {
      const missionPaths = [
        `/missions/${game.activeCountryCode}.json`,
        "/missions/default.json",
      ];

      for (const path of missionPaths) {
        try {
          const response = await fetch(path);
          if (!response.ok) continue;
          const missions = (await response.json()) as MissionDefinition[];
          if (mounted) setMissionCatalog(missions);
          return;
        } catch {
          continue;
        }
      }

      if (mounted) setMissionCatalog([]);
    };

    void loadMissionsForCountry();
    return () => {
      mounted = false;
    };
  }, [game.activeCountryCode]);

  const activeIncidents = game.incidents.filter(
    (incident) => incident.status !== "COMPLETE",
  );
  const hasStarted = game.stations.length > 0;
  const activeVehicleCount = game.vehicles.filter(
    (vehicle) =>
      vehicle.status === "DISPATCHED" || vehicle.status === "RETURNING",
  ).length;

  const completedIncidents = game.incidents.filter(
    (incident) => incident.status === "COMPLETE",
  );
  const staffedEmployees = game.vehicles.reduce(
    (sum, vehicle) => sum + VEHICLE_TYPES[vehicle.type].crew,
    0,
  );
  const unassignedEmployees = Math.max(game.employees - staffedEmployees, 0);

  const missionProgress = useCallback(
    (incident: Incident) => {
      const assigned = incident.assignedVehicleIds
        .map((id) => game.vehicles.find((vehicle) => vehicle.id === id))
        .filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
      const currentStage = incident.stages[incident.currentStage];

      const etaProgress =
        assigned.length === 0
          ? 0
          : assigned.reduce((sum, vehicle) => {
              if (vehicle.status !== "DISPATCHED") return sum + 1;
              if (vehicle.totalEta <= 0) return sum + 1;
              return sum + (1 - Math.max(vehicle.eta, 0) / vehicle.totalEta);
            }, 0) / assigned.length;

      const currentStageProgress =
        incident.stageWorkTotal <= 0
          ? 1
          : 1 -
            Math.max(incident.stageWorkRemaining, 0) / incident.stageWorkTotal;
      const missionStageProgress =
        incident.stages.length === 0
          ? 1
          : Math.min(
              1,
              (incident.currentStage + Math.max(0, currentStageProgress)) /
                incident.stages.length,
            );

      const returnProgress =
        assigned.length === 0
          ? 0
          : assigned.reduce((sum, vehicle) => {
              if (vehicle.status === "AVAILABLE") return sum + 1;
              if (vehicle.status !== "RETURNING") return sum;
              if (vehicle.totalEta <= 0) return sum + 1;
              return sum + (1 - Math.max(vehicle.eta, 0) / vehicle.totalEta);
            }, 0) / assigned.length;

      const filingProgress =
        incident.filingTotal <= 0
          ? 1
          : 1 - Math.max(incident.filingRemaining, 0) / incident.filingTotal;

      const overall = Math.max(
        0,
        Math.min(
          1,
          (etaProgress +
            missionStageProgress +
            returnProgress +
            filingProgress) /
            4,
        ),
      );

      const atScene =
        !!currentStage &&
        currentStage.required.every((requiredType) =>
          assigned.some(
            (vehicle) =>
              vehicle.type === requiredType &&
              vehicle.status === "DISPATCHED" &&
              vehicle.eta <= 0,
          ),
        );
      const hasVehicleOnWay = assigned.some(
        (vehicle) => vehicle.status === "DISPATCHED" && vehicle.eta > 0,
      );

      return {
        overall,
        eta: etaProgress,
        mission: missionStageProgress,
        returnTrip: returnProgress,
        filing: filingProgress,
        colorClass: hasVehicleOnWay
          ? "bg-amber-500"
          : atScene
            ? "bg-emerald-500"
            : "bg-sky-500",
      };
    },
    [game.vehicles],
  );

  const isWaterFeature = useCallback((feature: mapboxgl.MapboxGeoJSONFeature) => {
    const layerId = feature.layer?.id?.toLowerCase() ?? "";
    const sourceLayer = feature.sourceLayer?.toLowerCase() ?? "";
    const featureClass = String(feature.properties?.class ?? "").toLowerCase();
    const featureType = String(feature.properties?.type ?? "").toLowerCase();

    return (
      layerId.includes("water") ||
      sourceLayer.includes("water") ||
      featureClass.includes("water") ||
      featureType.includes("water")
    );
  }, []);

  const pickIncidentLocation = useCallback(
    (station: Station) => {
      const map = mapRef.current;
      const maxOffset = 0.04;
      const maxAttempts = 25;

      if (!map || !map.isStyleLoaded()) {
        return { lat: station.lat, lng: station.lng };
      }

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const lat = station.lat + (Math.random() - 0.5) * maxOffset;
        const lng = station.lng + (Math.random() - 0.5) * maxOffset;
        const rendered = map.queryRenderedFeatures(map.project([lng, lat]));
        const intersectsWater = rendered.some(isWaterFeature);
        if (!intersectsWater) return { lat, lng };
      }

      return { lat: station.lat, lng: station.lng };
    },
    [isWaterFeature],
  );

  const buildStationAt = useCallback(
    (lat: number, lng: number, type: StationType) => {
      setGame((current) => {
        if (!isWithinCountryBounds(lat, lng, current.activeCountryCode)) {
          return {
            ...current,
            log: [
              `Cannot build there. Move map inside ${findCountry(current.activeCountryCode).name}.`,
              ...current.log,
            ].slice(0, 10),
          };
        }
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
    [isWithinCountryBounds],
  );

  const selectCountryAsActive = useCallback(
    (countryCode: string) => {
      setGame((current) => ({
        ...current,
        activeCountryCode: countryCode,
        homeCountryCode:
          current.stations.length === 0 ? countryCode : current.homeCountryCode,
        unlockedCountryCodes: current.unlockedCountryCodes.includes(countryCode)
          ? current.unlockedCountryCodes
          : [...current.unlockedCountryCodes, countryCode],
        log: [
          `Active country set to ${findCountry(countryCode).name}.`,
          ...current.log,
        ].slice(0, 10),
      }));
      setCountryPickerOpen(false);
      setCountryPickerMode("manage");
      setRequiresCountrySelection(false);
      setBuildPickerOpen(false);
      setIsSelectingRealStation(false);
    },
    [],
  );

  const purchaseCountryLicense = useCallback((countryCode: string) => {
    setGame((current) => {
      if (current.unlockedCountryCodes.includes(countryCode)) return current;
      if (current.credits < COUNTRY_LICENSE_COST) return current;

      return {
        ...current,
        credits: current.credits - COUNTRY_LICENSE_COST,
        unlockedCountryCodes: [...current.unlockedCountryCodes, countryCode],
        activeCountryCode: countryCode,
        log: [
          `Purchased ${findCountry(countryCode).name} license for ${COUNTRY_LICENSE_COST}.`,
          ...current.log,
        ].slice(0, 10),
      };
    });
  }, []);

  const loadRealStations = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    if (!bounds) return;
    const zoom = map.getZoom();
    const center = map.getCenter();
    const south = bounds.getSouth().toFixed(4);
    const west = bounds.getWest().toFixed(4);
    const north = bounds.getNorth().toFixed(4);
    const east = bounds.getEast().toFixed(4);
    const aroundClause =
      zoom < 7
        ? `around:40000,${center.lat.toFixed(4)},${center.lng.toFixed(4)}`
        : `${south},${west},${north},${east}`;

    const queryByType: Record<StationType, string[]> = {
      FIRE: [
        'nwr["amenity"="fire_station"]',
        'nwr["emergency"="fire_station"]',
      ],
      EMS: [
        'nwr["amenity"="hospital"]',
        'nwr["emergency"="ambulance_station"]',
      ],
      POLICE: ['nwr["amenity"="police"]'],
    };

    const typeQuery = queryByType[selectedBuild]
      .map((selector) => `${selector}(${aroundClause});`)
      .join("");
    const query = `[out:json][timeout:25];(${typeQuery});out center tags;`;

    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
      });
      if (!response.ok) return;

      const data = (await response.json()) as {
        elements?: {
          id: number;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: { name?: string };
        }[];
      };
      const sites =
        data.elements
          ?.map((item) => {
            const lat = item.lat ?? item.center?.lat;
            const lng = item.lon ?? item.center?.lon;
            if (typeof lat !== "number" || typeof lng !== "number") return null;
            return {
              id: `real-${item.id}`,
              name:
                item.tags?.name ??
                `${STATION_TYPES[selectedBuild].label} Site ${item.id}`,
              type: selectedBuild,
              lat,
              lng,
            };
          })
          .filter((item): item is RealStationSite => Boolean(item))
          .slice(0, 25) ?? [];
      setRealStations(sites);
    } catch {
      setRealStations([]);
    }
  }, [selectedBuild]);

  useEffect(() => {
    if (!mapContainerRef.current || !mapToken || mapRef.current) return;

    mapboxgl.accessToken = mapToken;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: activeCountry.center,
      zoom: activeCountry.zoom,
      attributionControl: false,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      stationMarkerRefs.current.forEach((marker) => marker.remove());
      incidentMarkerRefs.current.forEach((marker) => marker.remove());
      realStationMarkerRefs.current.forEach((marker) => marker.remove());
      vehicleMarkerRefs.current.forEach((marker) => marker.remove());
      stationMarkerRefs.current = [];
      incidentMarkerRefs.current = [];
      realStationMarkerRefs.current = [];
      vehicleMarkerRefs.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [activeCountry.center, activeCountry.zoom, mapToken]);

  useEffect(() => {
    flyToCountry(game.activeCountryCode);
  }, [flyToCountry, game.activeCountryCode]);

  useEffect(() => {
    if (!isSelectingRealStation) return;
    loadRealStations();
  }, [isSelectingRealStation, loadRealStations]);

  useEffect(() => {
    if (!mapRef.current) return;

    routeLayerIdsRef.current.forEach((id) => {
      if (mapRef.current?.getLayer(id)) mapRef.current.removeLayer(id);
      if (mapRef.current?.getSource(id)) mapRef.current.removeSource(id);
    });
    routeLayerIdsRef.current = [];

    stationMarkerRefs.current.forEach((marker) => marker.remove());
    incidentMarkerRefs.current.forEach((marker) => marker.remove());
    realStationMarkerRefs.current.forEach((marker) => marker.remove());
    stationMarkerRefs.current = [];
    incidentMarkerRefs.current = [];
    realStationMarkerRefs.current = [];

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
        (vehicle.status === "DISPATCHED" || vehicle.status === "RETURNING") &&
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
        vehicle.totalEta <= 0
          ? 1
          : 1 - Math.max(vehicle.eta, 0) / vehicle.totalEta;
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
        vehicle.id,
        new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([lng, lat])
          .addTo(mapRef.current!),
      );

      if (vehicle.route.length >= 2) {
        const routeId = `vehicle-route-${vehicle.id}`;
        const addRouteLayer = () => {
          if (!mapRef.current) return;

          if (mapRef.current.getLayer(routeId)) {
            mapRef.current.removeLayer(routeId);
          }

          if (mapRef.current.getSource(routeId)) {
            mapRef.current.removeSource(routeId);
          }

          routeLayerIdsRef.current.push(routeId);

          mapRef.current.addSource(routeId, {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: vehicle.route,
              },
              properties: {},
            },
          });

          mapRef.current.addLayer({
            id: routeId,
            type: "line",
            source: routeId,
            paint: {
              "line-color":
                vehicle.status === "RETURNING" ? "#22d3ee" : "#f97316",
              "line-width": 3,
              "line-opacity": 0.8,
            },
          });
        };

        if (mapRef.current?.isStyleLoaded()) {
          addRouteLayer();
        } else {
          mapRef.current?.once("load", addRouteLayer);
        }
      }
    });

    if (isSelectingRealStation) {
      realStations.forEach((site) => {
        const el = document.createElement("button");
        el.className =
          "flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-100 bg-violet-500 text-white shadow-lg";
        el.innerHTML = "+";
        el.title = `Build at ${site.name}`;
        el.onclick = () => {
          const accepted = window.confirm(
            `Build ${STATION_TYPES[selectedBuild].label} station at ${site.name}?`,
          );
          if (!accepted) return;
          buildStationAt(site.lat, site.lng, selectedBuild);
          setIsSelectingRealStation(false);
          setBuildPickerOpen(false);
        };

        realStationMarkerRefs.current.push(
          new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat([site.lng, site.lat])
            .addTo(mapRef.current!),
        );
      });
    }
  }, [
    activeIncidents,
    buildStationAt,
    game.incidents,
    game.stations,
    game.vehicles,
    isSelectingRealStation,
    realStations,
    selectedBuild,
  ]);

  const chooseIncidentTemplates = useCallback(
    (state: GameState) => {
      if (missionCatalog.length === 0) return [] as SpawnableMission[];

      const fireStations = state.stations.filter((s) => s.type === "FIRE").length;
      const ambulanceStations = state.stations.filter((s) => s.type === "EMS").length;
      const policeStations = state.stations.filter((s) => s.type === "POLICE").length;
      const availableVehicleTypes = new Set(state.vehicles.map((vehicle) => vehicle.type));

      return missionCatalog
        .filter((mission) => {
          const prereq = mission.prerequisites;
          if ((prereq.fire_stations ?? 0) > fireStations) return false;
          if ((prereq.ambulance_stations ?? 0) > ambulanceStations) return false;
          if ((prereq.police_stations ?? 0) > policeStations) return false;
          return true;
        })
        .map(missionToTemplate)
        .filter((template): template is SpawnableMission => Boolean(template))
        .filter((template) =>
          template.stages[0].required.every((requiredType) =>
            availableVehicleTypes.has(requiredType),
          ),
        );
    },
    [missionCatalog],
  );

  function spawnIncident() {
    setGame((current) => {
      const activeCount = current.incidents.filter(
        (incident) => incident.status !== "COMPLETE",
      ).length;
      const available = chooseIncidentTemplates(current);
      if (
        available.length === 0 ||
        current.stations.length === 0 ||
        activeCount >= 2
      )
        return current;

      const station = current.stations[rand(0, current.stations.length - 1)];
      const template = available[rand(0, available.length - 1)];
      const difficulty =
        1 + Math.floor((current.resolvedCount + current.stations.length) / 4);

      const { lat, lng } = pickIncidentLocation(station);

      const incident: Incident = {
        id: current.nextIncidentId,
        title: template.title,
        category: template.category,
        severity: difficulty,
        reward: Math.max(650, Math.round(template.baseReward * (1.35 + (difficulty - 1) * 0.14))),
        lat,
        lng,
        status: "OPEN",
        currentStage: 0,
        stages: template.stages,
        assignedVehicleIds: [],
        stageWorkRemaining: STAGE_WORK_SECONDS,
        stageWorkTotal: STAGE_WORK_SECONDS,
        filingRemaining: FILING_SECONDS,
        filingTotal: FILING_SECONDS,
      };

      return {
        ...current,
        nextIncidentId: current.nextIncidentId + 1,
        incidents: [...current.incidents, incident],
        log: [
          `New ${incident.category} incident: ${incident.title}.`,
          ...current.log,
        ].slice(0, 10),
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
      if (
        !vehicle ||
        !incident ||
        vehicle.status !== "AVAILABLE" ||
        current.credits < DISPATCH_COST
      ) {
        return current;
      }

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
                route: roadRoute ?? [roadStart, [incident.lng, incident.lat]],
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

  function buyVehicle(stationId: number, type: VehicleType) {
    setGame((current) => {
      const config = VEHICLE_TYPES[type];
      const station = current.stations.find((item) => item.id === stationId);

      if (
        !station ||
        station.type !== config.stationType ||
        current.credits < config.cost
      ) {
        return current;
      }
      const staffed = current.vehicles.reduce(
        (sum, vehicle) => sum + VEHICLE_TYPES[vehicle.type].crew,
        0,
      );
      if (current.employees - staffed < config.crew) return current;
      const used = current.vehicles.filter(
        (v) => v.stationId === station.id,
      ).length;
      if (used >= stationCapacity(station.level)) return current;

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
        log: [
          `Purchased ${vehicle.name} for ${station.name}.`,
          ...current.log,
        ].slice(0, 10),
      };
    });
  }

  function upgradeStation(stationId: number) {
    setGame((current) => {
      const station = current.stations.find((s) => s.id === stationId);
      if (!station) return current;
      const cost = UPGRADE_BASE_COST + station.level * 25000;
      if (current.credits < cost) return current;

      return {
        ...current,
        credits: current.credits - cost,
        stations: current.stations.map((item) =>
          item.id === stationId ? { ...item, level: item.level + 1 } : item,
        ),
        log: [
          `Upgraded ${station.name} to level ${station.level + 1}.`,
          ...current.log,
        ].slice(0, 10),
      };
    });
  }

  function hireEmployee(amount = 1) {
    setGame((current) => {
      const hireCost = HIRING_COST * amount;
      if (current.credits < hireCost) return current;

      return {
        ...current,
        credits: current.credits - hireCost,
        employees: current.employees + amount,
        log: [`Hired ${amount} employee${amount > 1 ? "s" : ""}.`, ...current.log].slice(
          0,
          10,
        ),
      };
    });
  }

  function resetGame() {
    localStorage.removeItem("emergency-services-save-v2");
    setGame(initialState);
    setRequiresCountrySelection(true);
    setCountryPickerMode("initial");
    setCountryPickerOpen(false);
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((current) => {
        let creditsEarned = 0;
        const progressNotes: string[] = [];

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

          const finalStageComplete =
            incident.currentStage >= incident.stages.length - 1 &&
            incident.stageWorkRemaining <= 0;

          if (!finalStageComplete) {
            const hasAllRequired = stage.required.every((requiredType) =>
              assignedVehicles.some(
                (vehicle) =>
                  vehicle.type === requiredType &&
                  vehicle.status === "DISPATCHED" &&
                  vehicle.eta <= 0,
              ),
            );
            if (!hasAllRequired) return incident;
          }

          if (incident.stageWorkRemaining > 0) {
            return {
              ...incident,
              stageWorkRemaining: incident.stageWorkRemaining - 1,
            };
          }

          const nextStage = incident.currentStage + 1;
          if (nextStage >= incident.stages.length) {
            const assignedIds = new Set(incident.assignedVehicleIds);
            const anyDispatched = nextVehicles.some(
              (vehicle) =>
                assignedIds.has(vehicle.id) &&
                vehicle.status === "DISPATCHED" &&
                vehicle.eta <= 0,
            );
            if (anyDispatched) {
              nextVehicles = nextVehicles.map((vehicle) => {
                if (
                  !assignedIds.has(vehicle.id) ||
                  vehicle.status !== "DISPATCHED"
                )
                  return vehicle;
                const station = current.stations.find(
                  (s) => s.id === vehicle.stationId,
                );
                if (!station) return vehicle;
                const returnKm = haversineKm(station, incident);
                const returnEta = Math.max(
                  8,
                  Math.round(
                    (returnKm / VEHICLE_TYPES[vehicle.type].speedKmh) * 3600,
                  ),
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
            }

            const allBackAtStation = nextVehicles.every(
              (vehicle) =>
                !assignedIds.has(vehicle.id) ||
                (vehicle.status === "AVAILABLE" && vehicle.incidentId === null),
            );
            const nextFiling = allBackAtStation
              ? Math.max(incident.filingRemaining - 1, 0)
              : incident.filingRemaining;
            if (allBackAtStation && nextFiling === 0) {
              const missionCrewCost = assignedVehicles.reduce(
                (sum, vehicle) =>
                  sum + VEHICLE_TYPES[vehicle.type].crew * PAYROLL_PER_EMPLOYEE,
                0,
              );
              creditsEarned += incident.reward - missionCrewCost;
              progressNotes.push(
                `${incident.title} completed (+${incident.reward}, payroll -${missionCrewCost}).`,
              );
              return {
                ...incident,
                status: "COMPLETE" as IncidentStatus,
                filingRemaining: 0,
                stageWorkRemaining: 0,
              };
            }

            return {
              ...incident,
              filingRemaining: nextFiling,
              stageWorkRemaining: 0,
            };
          }

          progressNotes.push(
            `${incident.title}: moved to stage ${nextStage + 1}.`,
          );
          return {
            ...incident,
            currentStage: nextStage,
            stageWorkRemaining: STAGE_WORK_SECONDS,
            stageWorkTotal: STAGE_WORK_SECONDS,
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
        const nextCredits = current.credits + creditsEarned;

        if (creditsEarned > 0) {
          nextResolvedCount +=
            nextIncidents.filter((i) => i.status === "COMPLETE").length -
            current.incidents.filter((i) => i.status === "COMPLETE").length;
        }

        if (shouldSpawn) {
          const available = chooseIncidentTemplates({
            ...current,
            resolvedCount: nextResolvedCount,
            incidents: finalIncidents,
            nextIncidentId,
          });
          if (available.length > 0) {
            const station =
              current.stations[rand(0, current.stations.length - 1)];
            const template = available[rand(0, available.length - 1)];
            const difficulty =
              1 +
              Math.floor(
                (nextResolvedCount + current.stations.length) / 4,
              );
            const { lat, lng } = pickIncidentLocation(station);
            const incident: Incident = {
              id: nextIncidentId,
              title: template.title,
              category: template.category,
              severity: difficulty,
              reward: Math.max(
                650,
                Math.round(
                  template.baseReward * (1.35 + (difficulty - 1) * 0.14),
                ),
              ),
              lat,
              lng,
              status: "OPEN",
              currentStage: 0,
              stages: template.stages,
              assignedVehicleIds: [],
              stageWorkRemaining: STAGE_WORK_SECONDS,
              stageWorkTotal: STAGE_WORK_SECONDS,
              filingRemaining: FILING_SECONDS,
              filingTotal: FILING_SECONDS,
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
  }, [chooseIncidentTemplates, pickIncidentLocation]);

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
    (selectedStationId &&
      game.stations.find((station) => station.id === selectedStationId)) ??
    null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b1727] text-slate-100">
      {mapToken ? (
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute left-4 top-4 z-40 max-w-md rounded-xl border border-amber-700 bg-amber-900/80 p-4 text-sm text-amber-100">
          Add <code>VITE_MAPBOX_TOKEN</code> in your <code>.env</code> file to
          enable the live map.
        </div>
      )}

      {(countryPickerOpen || requiresCountrySelection) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">
                  {(requiresCountrySelection || countryPickerMode === "initial")
                    ? "Select your starting country"
                    : "Country licenses"}
                </p>
                <p className="text-xs text-slate-400">
                  Build stations only inside your active country borders.
                </p>
              </div>
              {!requiresCountrySelection && countryPickerMode !== "initial" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCountryPickerOpen(false)}
                >
                  Close
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {EU_COUNTRIES.map((country) => {
                const unlocked = game.unlockedCountryCodes.includes(country.code);
                const isActive = game.activeCountryCode === country.code;
                const canChooseForFree = !hasStarted;
                return (
                  <div
                    key={country.code}
                    className="rounded-lg border border-slate-700 bg-slate-950/70 p-2"
                  >
                    <p className="text-sm font-semibold">{country.name}</p>
                    <p className="mb-2 text-[11px] text-slate-400">
                      {canChooseForFree
                        ? "Free first country choice"
                        : unlocked
                          ? isActive
                            ? "Active"
                            : "Unlocked"
                          : `License cost: ${COUNTRY_LICENSE_COST}`}
                    </p>
                    {canChooseForFree ? (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          selectCountryAsActive(country.code);
                          flyToCountry(country.code);
                          setRequiresCountrySelection(false);
                        }}
                      >
                        {isActive ? "Selected for free" : "Choose for free"}
                      </Button>
                    ) : unlocked ? (
                      <Button
                        size="sm"
                        className="w-full"
                        variant={isActive ? "outline" : "default"}
                        onClick={() => {
                          selectCountryAsActive(country.code);
                          flyToCountry(country.code);
                        }}
                      >
                        {isActive ? "Active country" : "Set as active"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => purchaseCountryLicense(country.code)}
                        disabled={game.credits < COUNTRY_LICENSE_COST}
                      >
                        Buy license
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="absolute left-3 top-3 z-30 w-[250px] space-y-2 rounded-2xl border border-slate-700/70 bg-slate-950/80 p-2.5 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-black tracking-tight">
            Emergency Services
          </h1>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => {
                setCountryPickerMode("manage");
                setCountryPickerOpen(true);
                setBuildPickerOpen(false);
                setIsSelectingRealStation(false);
              }}
              title="Manage countries"
            >
              <Globe2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                setBuildPickerOpen((open) => !open);
                setIsSelectingRealStation(false);
              }}
              title="Buy building"
            >
              +
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="good">
            <Coins className="mr-1 h-3 w-3" />
            {game.credits}
          </Badge>
          <Badge tone="blue">
            <Users className="mr-1 h-3 w-3" />
            {game.employees} staff
          </Badge>
          <Badge>
            <Clock3 className="mr-1 h-3 w-3" />
            per mission payroll
          </Badge>
          <Badge>{activeCountry.name}</Badge>
          <Badge tone="blue">
            <Radio className="mr-1 h-3 w-3" />
            {activeIncidents.length} open
          </Badge>
          <Badge>{completedIncidents.length} closed</Badge>
          <Badge>{activeVehicleCount} active</Badge>
        </div>

        {buildPickerOpen && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Buy building
            </p>
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
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={() => setIsSelectingRealStation(true)}
            >
              Select real station on map
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => {
                setCountryPickerMode("manage");
                setCountryPickerOpen(true);
              }}
            >
              Change / buy country license
            </Button>
            <p className="mt-1 text-[11px] text-slate-400">
              {hasStarted
                ? `Cost: ${STATION_COST} credits`
                : "First building is free"}
            </p>
          </div>
        )}

        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => hireEmployee(1)}
            disabled={game.credits < HIRING_COST}
            title={`Hire 1 employee for ${HIRING_COST}`}
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" />
            Hire
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={spawnIncident}
            disabled={!hasStarted || activeIncidents.length >= 2}
          >
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
            const progress = missionProgress(incident);
            return (
              <div
                key={incident.id}
                className="rounded-xl border border-slate-700 bg-slate-900/90 p-2"
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
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Mission progress</span>
                    <span>{Math.round(progress.overall * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                    <div
                      className={`h-full transition-all ${progress.colorClass}`}
                      style={{
                        width: `${Math.round(progress.overall * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-300">
                  <span>1) ETA: {Math.round(progress.eta * 100)}%</span>
                  <span>
                    2) On scene: {Math.round(progress.mission * 100)}%
                  </span>
                  <span>
                    3) ETA back: {Math.round(progress.returnTrip * 100)}%
                  </span>
                  <span>4) Filing: {Math.round(progress.filing * 100)}%</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
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
                        disabled={
                          alreadyAssigned ||
                          !match ||
                          game.credits < DISPATCH_COST
                        }
                        onClick={() => {
                          if (match) dispatch(match.id, incident.id);
                        }}
                      >
                        {alreadyAssigned
                          ? `${type} sent`
                          : match
                            ? `Send ${type}`
                            : `No ${type}`}
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
            <p className="text-[11px] text-slate-300">
              Employees: {stationEmployees[selectedStation.id] ?? 0}
            </p>
            <p className="text-[11px] text-slate-300">
              Unassigned staff: {unassignedEmployees}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={
                game.credits < UPGRADE_BASE_COST + selectedStation.level * 25000
              }
              onClick={() => upgradeStation(selectedStation.id)}
            >
              Upgrade ({UPGRADE_BASE_COST + selectedStation.level * 25000})
            </Button>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-300">
              Buy vehicles
            </p>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {(Object.keys(VEHICLE_TYPES) as VehicleType[])
                .filter(
                  (type) =>
                    VEHICLE_TYPES[type].stationType === selectedStation.type &&
                    !DISABLED_VEHICLE_TYPES.includes(type),
                )
                .map((type) => {
                  const config = VEHICLE_TYPES[type];
                  const usedCapacity = game.vehicles.filter(
                    (vehicle) => vehicle.stationId === selectedStation.id,
                  ).length;
                  const hasCapacity =
                    usedCapacity < stationCapacity(selectedStation.level);
                  const hasStaff = unassignedEmployees >= config.crew;
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
                      key={`${selectedStation.id}-${type}`}
                      size="sm"
                      variant="outline"
                      disabled={
                        game.credits < config.cost || !hasCapacity || !hasStaff
                      }
                      onClick={() => buyVehicle(selectedStation.id, type)}
                    >
                      <Icon className="mr-1 h-3.5 w-3.5" />
                      {config.label}
                    </Button>
                  );
                })}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {game.log.slice(0, 4).map((entry, index) => (
            <p
              key={`${entry}-${index}`}
              className="rounded-lg bg-slate-900/90 p-2 text-[11px] text-slate-300"
            >
              {entry}
            </p>
          ))}
        </div>
      </div>
    </main>
  );
}
