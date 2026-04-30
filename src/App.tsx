"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Ambulance,
  Building2,
  CarFront,
  Coins,
  Flame,
  Globe2,
  House,
  Shield,
  Siren,
  Truck,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LiveIncidentsPanel } from "@/components/live-incidents-panel";
import type {
  IncidentCategory,
  IncidentStatus,
  VehicleStatus,
  VehicleType,
} from "@/types/game";

type StationType = "FIRE" | "EMS" | "POLICE";

type Station = {
  id: number;
  name: string;
  type: StationType;
  level: number;
  upgrades: {
    bayCapacity: number;
    trainingWing: number;
    dispatchCenter: number;
  };
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

type CountryDepot = {
  countryCode: string;
  lat: number;
  lng: number;
};

type VehicleDelivery = {
  id: number;
  vehicleType: VehicleType;
  stationId: number;
  progress: number;
  from: [number, number];
  to: [number, number];
  route: [number, number][];
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
  missionId?: string;
  missionKey?: string;
  isSpecialMission?: boolean;
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
  special?: boolean;
  spawn_limit_per_day?: number;
  unique_active?: boolean;
  average_credits: number;
  reward_floor?: number;
  reward_ceiling?: number;
  requirements: Partial<Record<string, number>>;
  prerequisites?: Partial<Record<string, number>>;
  stages?: MissionStageDefinition[];
  mission_categories: string[];
  fixed_location?: {
    lat: number;
    lng: number;
  };
};

type MissionStageDefinition = {
  label?: string;
  requirements: Partial<Record<string, number>>;
  prerequisites?: Partial<Record<string, number>>;
};

type VehicleCatalogEntry = {
  id: string;
  label?: string;
  station_type?: StationType;
  cost?: number;
  speed_kmh?: number;
  crew?: number;
  enabled?: boolean;
};

type SpawnableMission = {
  id: string;
  title: string;
  category: IncidentCategory;
  baseReward: number;
  rewardFloor?: number;
  rewardCeiling?: number;
  stages: IncidentStage[];
  fixedLocation?: {
    lat: number;
    lng: number;
  };
};

type IncidentNotification = {
  id: number;
  title: string;
  category: IncidentCategory;
  reward: number;
  severity: number;
  stageLabel: string;
  required: VehicleType[];
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
  reputation: number;
  weather: "CLEAR" | "RAIN" | "SNOW" | "HEAT";
  weatherTimer: number;
  missionDailySpawns: Record<string, string>;
};

type IncomeToast = {
  id: number;
  amount: number;
};

type RoutePreviewState = {
  incidentId: number;
  routes: {
    key: string;
    color: string;
    coordinates: [number, number][];
  }[];
  selectedRouteKey?: string;
};

type MapVisualStyle = "DARK_3D" | "SATELLITE_3D";

// MissionChief-like economy tuning (lower vehicle costs, no dispatch/payroll fees).
const STATION_COST = 100000;
const DISPATCH_COST = 0;
const UPGRADE_BASE_COST = 20000;
const HIRING_COST = 0;
const PAYROLL_PER_EMPLOYEE = 0;
const COUNTRY_LICENSE_COST = 100000;
const STAGE_WORK_SECONDS = 20;
const FILING_SECONDS = 10;
const WEATHER_INTERVAL_SECONDS = 75;
const WEATHER_EFFECTS: Record<
  GameState["weather"],
  { speedMultiplier: number; incidentMultiplier: number; label: string }
> = {
  CLEAR: { speedMultiplier: 1, incidentMultiplier: 1, label: "Clear" },
  RAIN: { speedMultiplier: 0.84, incidentMultiplier: 1.18, label: "Rain" },
  SNOW: { speedMultiplier: 0.72, incidentMultiplier: 1.24, label: "Snow" },
  HEAT: { speedMultiplier: 0.9, incidentMultiplier: 1.12, label: "Heat" },
};
const MAPBOX_DIRECTIONS_BASE_URL =
  "https://api.mapbox.com/directions/v5/mapbox/driving";
const TERRAIN_EXAGGERATION: Record<MapVisualStyle, number> = {
  SATELLITE_3D: 1.2,
  DARK_3D: 1.35,
};

const STATION_TYPES = {
  FIRE: { label: "Fire", icon: Flame },
  EMS: { label: "EMS", icon: Ambulance },
  POLICE: { label: "Police", icon: Shield },
} as const;

type EuCountry = {
  code: string;
  name: string;
  center: [number, number];
  capital: [number, number];
  zoom: number;
  bounds: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
};

const EU_COUNTRIES: EuCountry[] = [
  { code: "AT", name: "Austria", center: [14.2, 47.6], capital: [16.3738, 48.2082], zoom: 6.5, bounds: { minLng: 9.4, maxLng: 17.2, minLat: 46.2, maxLat: 49.1 } },
  { code: "BE", name: "Belgium", center: [4.6, 50.8], capital: [4.3517, 50.8503], zoom: 7.5, bounds: { minLng: 2.4, maxLng: 6.4, minLat: 49.4, maxLat: 51.7 } },
  { code: "BG", name: "Bulgaria", center: [25.3, 42.8], capital: [23.3219, 42.6977], zoom: 6.4, bounds: { minLng: 22.3, maxLng: 28.7, minLat: 41.2, maxLat: 44.3 } },
  { code: "HR", name: "Croatia", center: [16.8, 45.2], capital: [15.9819, 45.815], zoom: 6.5, bounds: { minLng: 13.4, maxLng: 19.5, minLat: 42.2, maxLat: 46.6 } },
  { code: "CY", name: "Cyprus", center: [33.0, 35.1], capital: [33.3823, 35.1856], zoom: 8.2, bounds: { minLng: 32.0, maxLng: 34.9, minLat: 34.4, maxLat: 35.8 } },
  { code: "CZ", name: "Czechia", center: [15.5, 49.9], capital: [14.4378, 50.0755], zoom: 6.8, bounds: { minLng: 12.0, maxLng: 18.9, minLat: 48.5, maxLat: 51.1 } },
  { code: "DK", name: "Denmark", center: [10.0, 56.1], capital: [12.5683, 55.6761], zoom: 6.7, bounds: { minLng: 7.8, maxLng: 12.7, minLat: 54.5, maxLat: 57.8 } },
  { code: "EE", name: "Estonia", center: [25.4, 58.7], capital: [24.7536, 59.437], zoom: 6.8, bounds: { minLng: 21.7, maxLng: 28.2, minLat: 57.5, maxLat: 59.8 } },
  { code: "FI", name: "Finland", center: [25.7, 64.3], capital: [24.9384, 60.1699], zoom: 4.8, bounds: { minLng: 20.5, maxLng: 31.8, minLat: 59.7, maxLat: 70.2 } },
  { code: "FR", name: "France", center: [2.4, 46.3], capital: [2.3522, 48.8566], zoom: 5.2, bounds: { minLng: -5.3, maxLng: 9.8, minLat: 41.1, maxLat: 51.2 } },
  { code: "DE", name: "Germany", center: [10.4, 51.1], capital: [13.405, 52.52], zoom: 5.8, bounds: { minLng: 5.8, maxLng: 15.1, minLat: 47.1, maxLat: 55.1 } },
  { code: "GR", name: "Greece", center: [22.8, 39.1], capital: [23.7275, 37.9838], zoom: 6, bounds: { minLng: 19.4, maxLng: 28.3, minLat: 34.6, maxLat: 41.9 } },
  { code: "HU", name: "Hungary", center: [19.3, 47.1], capital: [19.0402, 47.4979], zoom: 7, bounds: { minLng: 16.0, maxLng: 22.9, minLat: 45.7, maxLat: 48.7 } },
  { code: "IE", name: "Ireland", center: [-8.2, 53.3], capital: [-6.2603, 53.3498], zoom: 6.2, bounds: { minLng: -10.8, maxLng: -5.3, minLat: 51.4, maxLat: 55.5 } },
  { code: "IT", name: "Italy", center: [12.7, 42.9], capital: [12.4964, 41.9028], zoom: 5.5, bounds: { minLng: 6.6, maxLng: 18.7, minLat: 36.6, maxLat: 47.2 } },
  { code: "LV", name: "Latvia", center: [24.9, 56.9], capital: [24.1052, 56.9496], zoom: 7, bounds: { minLng: 20.9, maxLng: 28.3, minLat: 55.6, maxLat: 58.1 } },
  { code: "LT", name: "Lithuania", center: [23.8, 55.3], capital: [25.2797, 54.6872], zoom: 7, bounds: { minLng: 20.9, maxLng: 26.9, minLat: 53.9, maxLat: 56.6 } },
  { code: "LU", name: "Luxembourg", center: [6.1, 49.8], capital: [6.1319, 49.6116], zoom: 8.4, bounds: { minLng: 5.7, maxLng: 6.6, minLat: 49.4, maxLat: 50.2 } },
  { code: "MT", name: "Malta", center: [14.4, 35.9], capital: [14.5146, 35.8989], zoom: 10, bounds: { minLng: 14.1, maxLng: 14.7, minLat: 35.8, maxLat: 36.1 } },
  { code: "NL", name: "Netherlands", center: [5.3, 52.2], capital: [4.9041, 52.3676], zoom: 7, bounds: { minLng: 3.2, maxLng: 7.3, minLat: 50.6, maxLat: 53.7 } },
  { code: "PL", name: "Poland", center: [19.2, 52.1], capital: [21.0122, 52.2297], zoom: 6, bounds: { minLng: 14.1, maxLng: 24.2, minLat: 49.0, maxLat: 54.9 } },
  { code: "PT", name: "Portugal", center: [-8.0, 39.7], capital: [-9.1393, 38.7223], zoom: 6, bounds: { minLng: -9.6, maxLng: -6.1, minLat: 36.8, maxLat: 42.2 } },
  { code: "RO", name: "Romania", center: [24.9, 45.9], capital: [26.1025, 44.4268], zoom: 6.2, bounds: { minLng: 20.2, maxLng: 29.8, minLat: 43.6, maxLat: 48.3 } },
  { code: "SK", name: "Slovakia", center: [19.5, 48.7], capital: [17.1077, 48.1486], zoom: 7, bounds: { minLng: 16.8, maxLng: 22.8, minLat: 47.7, maxLat: 49.7 } },
  { code: "SI", name: "Slovenia", center: [14.9, 46.1], capital: [14.5058, 46.0569], zoom: 7.6, bounds: { minLng: 13.3, maxLng: 16.6, minLat: 45.4, maxLat: 46.9 } },
  { code: "ES", name: "Spain", center: [-3.7, 40.3], capital: [-3.7038, 40.4168], zoom: 5.5, bounds: { minLng: -9.4, maxLng: 3.4, minLat: 35.8, maxLat: 43.9 } },
  { code: "SE", name: "Sweden", center: [16.0, 62.0], capital: [18.0686, 59.3293], zoom: 4.6, bounds: { minLng: 11.0, maxLng: 24.2, minLat: 55.3, maxLat: 69.2 } },
];

const findCountryByLocation = (lat: number, lng: number) =>
  EU_COUNTRIES.find(
    (country) =>
      lat >= country.bounds.minLat &&
      lat <= country.bounds.maxLat &&
      lng >= country.bounds.minLng &&
      lng <= country.bounds.maxLng,
  ) ?? null;

const getCountryDepot = (countryCode: string): CountryDepot => {
  const country = findCountry(countryCode);
  return {
    countryCode,
    lat: country.capital[1],
    lng: country.capital[0],
  };
};

const VEHICLE_TYPES = {
  ENGINE: {
    label: "Engine",
    stationType: "FIRE",
    cost: 5000,
    speedKmh: 55,
    crew: 4,
    icon: Flame,
  },
  LADDER: {
    label: "Ladder",
    stationType: "FIRE",
    cost: 10000,
    speedKmh: 48,
    crew: 5,
    icon: Truck,
  },
  AMBULANCE: {
    label: "Ambulance",
    stationType: "EMS",
    cost: 5000,
    speedKmh: 65,
    crew: 2,
    icon: Ambulance,
  },
  RESCUE: {
    label: "Rescue",
    stationType: "EMS",
    cost: 10000,
    speedKmh: 62,
    crew: 3,
    icon: Siren,
  },
  PATROL: {
    label: "Patrol",
    stationType: "POLICE",
    cost: 2500,
    speedKmh: 70,
    crew: 1,
    icon: Shield,
  },
  SWAT: {
    label: "SWAT",
    stationType: "POLICE",
    cost: 12500,
    speedKmh: 58,
    crew: 4,
    icon: Shield,
  },
} as Record<
  VehicleType,
  {
    label: string;
    stationType: StationType;
    cost: number;
    speedKmh: number;
    crew: number;
    icon: typeof Flame;
  }
>;
const DEFAULT_DISABLED_VEHICLE_TYPES: VehicleType[] = ["LADDER"];

const initialState: GameState = {
  credits: 100000,
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
  reputation: 50,
  weather: "CLEAR",
  weatherTimer: WEATHER_INTERVAL_SECONDS,
  missionDailySpawns: {},
};

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

function getRushHourModifier() {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Europe/Berlin",
    }).format(now),
  );
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
  const isLateNight = hour >= 23 || hour <= 4;
  const trafficMultiplier = isRushHour ? 0.72 : isLateNight ? 1.08 : 0.92;
  const label = isRushHour ? "Rush hour" : isLateNight ? "Late night" : "Normal traffic";
  return { trafficMultiplier, label };
}

function requirementCounts(required: VehicleType[]) {
  return required.reduce(
    (counts, type) => ({
      ...counts,
      [type]: (counts[type] ?? 0) + 1,
    }),
    {} as Partial<Record<VehicleType, number>>,
  );
}

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

function stationCapacity(station: Pick<Station, "level" | "upgrades">) {
  return 4 + (station.level - 1) * 2 + station.upgrades.bayCapacity * 2;
}

function starterVehicleType(stationType: StationType): VehicleType {
  if (stationType === "FIRE") return "ENGINE";
  if (stationType === "EMS") return "AMBULANCE";
  return "PATROL";
}

const LEGACY_REQUIREMENT_TO_VEHICLE: Record<string, VehicleType> = {
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

function missionToTemplate(
  mission: MissionDefinition,
  state: GameState,
): SpawnableMission | null {
  const baseRequiredTypes = resolveMissionRequirements(mission.requirements);
  if (baseRequiredTypes.length === 0) return null;

  const category = mission.mission_categories
    .map((value) => MISSION_CATEGORY_TO_INCIDENT[value])
    .find((value): value is IncidentCategory => Boolean(value));
  if (!category) return null;

  const stages: IncidentStage[] = [
    { label: "Primary Response", required: baseRequiredTypes },
  ];
  const dynamicStages = mission.stages ?? [];

  dynamicStages.forEach((stage, index) => {
    if (!meetsMissionPrerequisites(stage.prerequisites, state)) return;
    const required = resolveMissionRequirements(stage.requirements);
    if (required.length === 0) return;
    stages.push({
      label: stage.label?.trim() || `Stage ${index + 2}`,
      required,
    });
  });

  return {
    id: mission.id,
    title: mission.name,
    category,
    baseReward: mission.average_credits,
    rewardFloor: mission.reward_floor,
    rewardCeiling: mission.reward_ceiling,
    stages,
    fixedLocation: mission.fixed_location,
  };
}

function calculateIncidentReward(
  template: SpawnableMission,
  difficulty: number,
  reputation: number,
) {
  const requiredVehicles = template.stages.reduce(
    (sum, stage) => sum + stage.required.length,
    0,
  );
  const complexityMultiplier =
    1 +
    Math.max(requiredVehicles - 1, 0) * 0.18 +
    Math.max(template.stages.length - 1, 0) * 0.12;
  const difficultyMultiplier = 1 + Math.max(difficulty - 1, 0) * 0.08;
  const reputationMultiplier = 0.92 + reputation / 500;
  const randomMultiplier = 0.9 + Math.random() * 0.2;

  const rawReward =
    template.baseReward *
    complexityMultiplier *
    difficultyMultiplier *
    reputationMultiplier *
    randomMultiplier;

  const minReward = Math.max(
    25,
    Math.round(template.rewardFloor ?? template.baseReward * 0.65),
  );
  const maxReward = Math.max(
    minReward,
    Math.round(template.rewardCeiling ?? template.baseReward * 2.2),
  );

  return Math.round(Math.min(maxReward, Math.max(minReward, rawReward)));
}

function getCurrentDayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function isSpecialMissionDefinition(mission: MissionDefinition) {
  return mission.special ?? Boolean(mission.fixed_location);
}

function normalizeRequirementKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function resolveVehicleRequirementKey(key: string): VehicleType | null {
  const normalizedKey = normalizeRequirementKey(key);
  if (normalizedKey in LEGACY_REQUIREMENT_TO_VEHICLE) {
    return LEGACY_REQUIREMENT_TO_VEHICLE[normalizedKey];
  }

  const directVehicleType = key.toUpperCase() as VehicleType;
  if (directVehicleType in VEHICLE_TYPES) {
    return directVehicleType;
  }

  const vehicleMatch = (Object.entries(VEHICLE_TYPES) as Array<
    [VehicleType, (typeof VEHICLE_TYPES)[VehicleType]]
  >).find(([type, config]) => {
    const normalizedType = normalizeRequirementKey(type);
    const normalizedTypePlural = `${normalizedType}s`;
    const normalizedLabel = normalizeRequirementKey(config.label);
    const normalizedLabelPlural = `${normalizedLabel}s`;
    return (
      normalizedKey === normalizedType ||
      normalizedKey === normalizedTypePlural ||
      normalizedKey === normalizedLabel ||
      normalizedKey === normalizedLabelPlural
    );
  });

  return vehicleMatch?.[0] ?? null;
}

function resolveMissionRequirements(
  requirements: Partial<Record<string, number>>,
): VehicleType[] {
  return Object.entries(requirements)
    .flatMap(([key, count]) => {
      if (typeof count !== "number" || count <= 0) return [];
      const vehicleType = resolveVehicleRequirementKey(key);
      if (!vehicleType) return [];
      return Array(count).fill(vehicleType);
    })
    .filter((vehicleType): vehicleType is VehicleType => Boolean(vehicleType));
}

function meetsMissionPrerequisites(
  prerequisites: Partial<Record<string, number>> | undefined,
  state: GameState,
) {
  const prereq = prerequisites ?? {};
  const fireStations = state.stations.filter((s) => s.type === "FIRE").length;
  const ambulanceStations = state.stations.filter((s) => s.type === "EMS").length;
  const policeStations = state.stations.filter((s) => s.type === "POLICE").length;

  if ((prereq.fire_stations ?? 0) > fireStations) return false;
  if ((prereq.ambulance_stations ?? 0) > ambulanceStations) return false;
  if ((prereq.police_stations ?? 0) > policeStations) return false;
  return true;
}

function stationSupportsRequiredTypes(
  station: Station,
  requiredTypes: VehicleType[],
  vehicles: Vehicle[],
) {
  const requiredCounts = requirementCounts(requiredTypes);
  const stationVehicleCounts = vehicles
    .filter((vehicle) => vehicle.stationId === station.id)
    .reduce(
      (counts, vehicle) => ({
        ...counts,
        [vehicle.type]: (counts[vehicle.type] ?? 0) + 1,
      }),
      {} as Partial<Record<VehicleType, number>>,
    );

  return Object.entries(requiredCounts).every(([type, count]) => {
    const available = stationVehicleCounts[type as VehicleType] ?? 0;
    return available >= (count ?? 0);
  });
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
      reputation: Math.max(0, Math.min(100, parsed.reputation ?? 50)),
      weather: parsed.weather ?? "CLEAR",
      weatherTimer: parsed.weatherTimer ?? WEATHER_INTERVAL_SECONDS,
      missionDailySpawns: parsed.missionDailySpawns ?? {},
      homeCountryCode,
      activeCountryCode,
      unlockedCountryCodes: unlockedCountryCodes.includes(homeCountryCode)
        ? unlockedCountryCodes
        : [homeCountryCode, ...unlockedCountryCodes],
      stations: parsed.stations.map((station) => ({
        ...station,
        upgrades: station.upgrades ?? {
          bayCapacity: Math.max(station.level - 1, 0),
          trainingWing: 0,
          dispatchCenter: 0,
        },
      })),
      incidents: parsed.incidents.map((incident) => ({
        ...incident,
        missionId: incident.missionId,
        missionKey: incident.missionKey,
        isSpecialMission: incident.isSpecialMission ?? false,
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
  includeAlternatives = false,
) {
  if (!token) return null;

  const path = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const params = new URLSearchParams({
    alternatives: includeAlternatives ? "true" : "false",
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
    const routes = (data.routes ?? [])
      .map((route) => {
        const coordinates = route.geometry?.coordinates;
        if (!coordinates || coordinates.length < 2) return null;
        return {
          distanceKm: route.distance / 1000,
          coordinates,
        };
      })
      .filter((route): route is { distanceKm: number; coordinates: [number, number][] } => Boolean(route));

    if (routes.length === 0) return null;
    return includeAlternatives ? routes : routes[0];
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

type IncidentMarkerPhase =
  | "UNTOUCHED"
  | "EN_ROUTE"
  | "ON_SCENE"
  | "RETURNING"
  | "FILING";

const INCIDENT_MARKER_PHASE_STYLES: Record<
  IncidentMarkerPhase,
  { label: string; background: string }
> = {
  UNTOUCHED: { label: "Nothing dispatched yet", background: "#dc2626" },
  EN_ROUTE: { label: "Truck en route", background: "#f59e0b" },
  ON_SCENE: { label: "Truck on scene", background: "#16a34a" },
  RETURNING: { label: "Truck returning", background: "#2563eb" },
  FILING: { label: "Filing report", background: "#6b7280" },
};

function getIncidentMarkerPhase(incident: Incident, vehicles: Vehicle[]) {
  const assigned = vehicles.filter((vehicle) => vehicle.incidentId === incident.id);
  const hasReturning = assigned.some((vehicle) => vehicle.status === "RETURNING");
  if (hasReturning) return "RETURNING" as const;

  const isFilingStage =
    incident.currentStage >= incident.stages.length - 1 &&
    incident.stageWorkRemaining <= 0;
  if (isFilingStage) return "FILING" as const;

  const hasOnScene = assigned.some(
    (vehicle) => vehicle.status === "DISPATCHED" && vehicle.eta <= 0,
  );
  if (hasOnScene) return "ON_SCENE" as const;

  const hasEnRoute = assigned.some(
    (vehicle) => vehicle.status === "DISPATCHED" && vehicle.eta > 0,
  );
  if (hasEnRoute) return "EN_ROUTE" as const;

  return "UNTOUCHED" as const;
}

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
  const [disabledVehicleTypes, setDisabledVehicleTypes] = useState<VehicleType[]>(
    DEFAULT_DISABLED_VEHICLE_TYPES,
  );
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
  const [deliveries, setDeliveries] = useState<VehicleDelivery[]>([]);
  const deliveryMarkerRefs = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const [focusedIncidentId, setFocusedIncidentId] = useState<number | null>(null);
  const [incidentNotifications, setIncidentNotifications] = useState<
    IncidentNotification[]
  >([]);
  const [incomeToasts, setIncomeToasts] = useState<IncomeToast[]>([]);
  const [routePreview, setRoutePreview] = useState<RoutePreviewState | null>(null);
  const [mapVisualStyle] = useState<MapVisualStyle>("SATELLITE_3D");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const stationMarkerRefs = useRef<mapboxgl.Marker[]>([]);
  const incidentMarkerRefs = useRef<mapboxgl.Marker[]>([]);
  const realStationMarkerRefs = useRef<mapboxgl.Marker[]>([]);
  const vehicleMarkerRefs = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const vehicleProgressFloorRef = useRef<
    Map<
      number,
      {
        status: VehicleStatus;
        incidentId: number | null;
        totalEta: number;
        progress: number;
      }
    >
  >(new Map());
  const pendingReturnRouteVehicleIdsRef = useRef<Set<number>>(new Set());
  const lastVehicleTickAtRef = useRef(0);
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  const activeCountry = findCountry(game.activeCountryCode);
  const mapStyleUrl =
    mapVisualStyle === "SATELLITE_3D"
      ? "mapbox://styles/mapbox/streets-v12"
      : "mapbox://styles/mapbox/dark-v11";

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
    lastVehicleTickAtRef.current = Date.now();
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

    const loadVehicleCatalog = async () => {
      try {
        const response = await fetch("/vehicles.json");
        if (!response.ok) return;

        const entries = (await response.json()) as VehicleCatalogEntry[];
        const nextDisabled = new Set<VehicleType>();

        entries.forEach((entry) => {
          const type = resolveVehicleRequirementKey(entry.id);
          if (!type) return;

          const current = VEHICLE_TYPES[type];
          VEHICLE_TYPES[type] = {
            ...current,
            label: entry.label ?? current.label,
            stationType: entry.station_type ?? current.stationType,
            cost: entry.cost ?? current.cost,
            speedKmh: entry.speed_kmh ?? current.speedKmh,
            crew: entry.crew ?? current.crew,
          };

          if (entry.enabled === false) {
            nextDisabled.add(type);
          }
        });

        if (mounted && nextDisabled.size > 0) {
          setDisabledVehicleTypes(Array.from(nextDisabled));
        }
      } catch {
        // Keep built-in defaults when no JSON is present.
      }
    };

    void loadVehicleCatalog();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadMissionsForCountry = async () => {
      let defaultMissions: MissionDefinition[] = [];
      try {
        const defaultResponse = await fetch("/missions/default.json");
        if (defaultResponse.ok) {
          defaultMissions = (await defaultResponse.json()) as MissionDefinition[];
        }
      } catch {
        defaultMissions = [];
      }

      let countryMissions: MissionDefinition[] = [];
      const countryMissionPaths = [
        `/missions/${game.activeCountryCode}.json`,
        `/missions/${game.activeCountryCode.toLowerCase()}.json`,
      ];
      for (const path of countryMissionPaths) {
        try {
          const countryResponse = await fetch(path);
          if (countryResponse.ok) {
            countryMissions = (await countryResponse.json()) as MissionDefinition[];
            if (countryMissions.length > 0) break;
          }
        } catch {
          // Try next path variant.
        }
      }

      const nextCatalog =
        countryMissions.length > 0
          ? [
              ...defaultMissions,
              ...countryMissions.filter(
                (countryMission) =>
                  !defaultMissions.some(
                    (defaultMission) => defaultMission.id === countryMission.id,
                  ),
              ),
            ]
          : defaultMissions;

      if (mounted) setMissionCatalog(nextCatalog);
    };

    void loadMissionsForCountry();
    return () => {
      mounted = false;
    };
  }, [game.activeCountryCode]);

  const activeIncidents = game.incidents.filter(
    (incident) => incident.status !== "COMPLETE",
  );
  const getSmoothedProgress = useCallback((vehicle: Vehicle) => {
    const isMoving =
      vehicle.status === "DISPATCHED" || vehicle.status === "RETURNING";
    if (!isMoving) {
      vehicleProgressFloorRef.current.delete(vehicle.id);
      return vehicle.totalEta <= 0
        ? 1
        : 1 - Math.max(vehicle.eta, 0) / vehicle.totalEta;
    }

      const elapsedSinceTick = Math.max(
      0,
      (Date.now() - lastVehicleTickAtRef.current) / 1000,
    );
    const smoothEta =
      isMoving && vehicle.eta > 0
        ? Math.max(vehicle.eta - Math.min(elapsedSinceTick, 0.98), 0)
        : Math.max(vehicle.eta, 0);

    const rawProgress =
      vehicle.totalEta <= 0 ? 1 : 1 - smoothEta / vehicle.totalEta;
    const previous = vehicleProgressFloorRef.current.get(vehicle.id);
    const sameLeg =
      previous &&
      previous.status === vehicle.status &&
      previous.incidentId === vehicle.incidentId &&
      previous.totalEta === vehicle.totalEta;

    const progress = sameLeg ? Math.max(previous.progress, rawProgress) : rawProgress;
    vehicleProgressFloorRef.current.set(vehicle.id, {
      status: vehicle.status,
      incidentId: vehicle.incidentId,
      totalEta: vehicle.totalEta,
      progress,
    });

    return progress;
  }, []);
  const hasStarted = game.stations.length > 0;
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

      const requiredCounts = currentStage
        ? requirementCounts(currentStage.required)
        : {};
      const arrivedCounts = assigned.reduce(
        (counts, vehicle) => {
          if (!(vehicle.status === "DISPATCHED" && vehicle.eta <= 0)) {
            return counts;
          }
          return {
            ...counts,
            [vehicle.type]: (counts[vehicle.type] ?? 0) + 1,
          };
        },
        {} as Partial<Record<VehicleType, number>>,
      );
      const atScene =
        !!currentStage &&
        Object.entries(requiredCounts).every(
          ([type, count]) =>
            (arrivedCounts[type as VehicleType] ?? 0) >= (count ?? 0),
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
        return {
          lat: station.lat + (Math.random() - 0.5) * maxOffset,
          lng: station.lng + (Math.random() - 0.5) * maxOffset,
        };
      }

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const lat = station.lat + (Math.random() - 0.5) * maxOffset;
        const lng = station.lng + (Math.random() - 0.5) * maxOffset;
        const rendered = map.queryRenderedFeatures(map.project([lng, lat]));
        const intersectsWater = rendered.some(isWaterFeature);
        if (!intersectsWater) return { lat, lng };
      }

      return {
        lat: station.lat + (Math.random() - 0.5) * maxOffset,
        lng: station.lng + (Math.random() - 0.5) * maxOffset,
      };
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
          upgrades: {
            bayCapacity: 0,
            trainingWing: 0,
            dispatchCenter: 0,
          },
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
      const endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
      ];
      let data:
        | {
            elements?: {
              id: number;
              lat?: number;
              lon?: number;
              center?: { lat: number; lon: number };
              tags?: { name?: string };
            }[];
          }
        | null = null;

      for (const endpoint of endpoints) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: new URLSearchParams({ data: query }),
        });
        if (!response.ok) continue;
        data = (await response.json()) as {
          elements?: {
            id: number;
            lat?: number;
            lon?: number;
            center?: { lat: number; lon: number };
            tags?: { name?: string };
          }[];
        };
        break;
      }
      if (!data) {
        setRealStations([]);
        return;
      }

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
      style: mapStyleUrl,
      center: activeCountry.center,
      zoom: activeCountry.zoom,
      pitch: 58,
      bearing: -20,
      maxPitch: 85,
      attributionControl: false,
    });

    const apply3dTerrain = () => {
      if (!mapRef.current) return;
      if (!mapRef.current.getSource("mapbox-dem")) {
        mapRef.current.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      mapRef.current.setTerrain({
        source: "mapbox-dem",
        exaggeration: TERRAIN_EXAGGERATION[mapVisualStyle],
      });
      if (!mapRef.current.getLayer("terrain-hillshade")) {
        mapRef.current.addLayer({
          id: "terrain-hillshade",
          type: "hillshade",
          source: "mapbox-dem",
          paint: {
            "hillshade-shadow-color": "#1f2937",
            "hillshade-highlight-color": "#f8fafc",
            "hillshade-accent-color": "#64748b",
            "hillshade-exaggeration": 0.22,
          },
        });
      }
      mapRef.current.setLayoutProperty(
        "terrain-hillshade",
        "visibility",
        mapVisualStyle === "DARK_3D" ? "visible" : "none",
      );
      mapRef.current.setFog({
        color: "rgb(12, 18, 30)",
        "high-color": "rgb(26, 56, 92)",
        "horizon-blend": 0.18,
      });
    };

    mapRef.current.on("style.load", apply3dTerrain);
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
  }, [activeCountry.center, activeCountry.zoom, mapStyleUrl, mapToken, mapVisualStyle]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(mapStyleUrl);
  }, [mapStyleUrl]);

  useEffect(() => {
    flyToCountry(game.activeCountryCode);
  }, [flyToCountry, game.activeCountryCode]);

  useEffect(() => {
    if (!isSelectingRealStation) return;
    loadRealStations();
  }, [isSelectingRealStation, loadRealStations]);

  useEffect(() => {
    const activeReturningIds = new Set(
      game.vehicles
        .filter(
          (vehicle) =>
            vehicle.status === "RETURNING" && vehicle.incidentId !== null,
        )
        .map((vehicle) => vehicle.id),
    );
    pendingReturnRouteVehicleIdsRef.current.forEach((vehicleId) => {
      if (!activeReturningIds.has(vehicleId)) {
        pendingReturnRouteVehicleIdsRef.current.delete(vehicleId);
      }
    });

    if (!mapToken) return;

    const rerouteCandidates = game.vehicles.filter((vehicle) => {
      if (vehicle.status !== "RETURNING" || vehicle.incidentId === null) return false;
      return !pendingReturnRouteVehicleIdsRef.current.has(vehicle.id);
    });

    if (rerouteCandidates.length === 0) return;

    rerouteCandidates.forEach((vehicle) => {
      pendingReturnRouteVehicleIdsRef.current.add(vehicle.id);
    });

    void Promise.all(
      rerouteCandidates.map(async (vehicle) => {
        const station = game.stations.find((s) => s.id === vehicle.stationId);
        const incident = game.incidents.find((i) => i.id === vehicle.incidentId);
        if (!station || !incident) return null;
        const rawRoute = await fetchRoadRoute(incident, station, mapToken, false);
        const route = Array.isArray(rawRoute) ? rawRoute[0] : rawRoute;
        if (!route) return null;
        return {
          vehicleId: vehicle.id,
          incidentId: incident.id,
          stationId: station.id,
          coordinates: route.coordinates,
          distanceKm: route.distanceKm,
        };
      }),
    ).then((results) => {
      const validResults = results.filter(
        (result): result is {
          vehicleId: number;
          incidentId: number;
          stationId: number;
          coordinates: [number, number][];
          distanceKm: number;
        } => Boolean(result),
      );
      if (validResults.length === 0) return;

      setGame((current) => {
        const updates = new Map(validResults.map((item) => [item.vehicleId, item]));
        const nextVehicles = current.vehicles.map((vehicle) => {
          const update = updates.get(vehicle.id);
          if (!update) return vehicle;
          if (
            vehicle.status !== "RETURNING" ||
            vehicle.incidentId !== update.incidentId ||
            vehicle.stationId !== update.stationId
          ) {
            return vehicle;
          }

          const station = current.stations.find((s) => s.id === vehicle.stationId);
          if (!station) return vehicle;
          const weatherMultiplier =
            WEATHER_EFFECTS[current.weather].speedMultiplier;
          const traffic = getRushHourModifier();
          const dispatchUpgrade =
            1 + (station.upgrades.dispatchCenter ?? 0) * 0.06;
          const newTotalEta = Math.max(
            8,
            Math.round(
              (update.distanceKm /
                (VEHICLE_TYPES[vehicle.type].speedKmh *
                  weatherMultiplier *
                  traffic.trafficMultiplier *
                  dispatchUpgrade)) *
                3600,
            ),
          );
          const currentProgress =
            vehicle.totalEta <= 0
              ? 0
              : 1 - Math.max(vehicle.eta, 0) / vehicle.totalEta;
          const adjustedEta = Math.max(
            0,
            Math.round(newTotalEta * (1 - Math.min(Math.max(currentProgress, 0), 1))),
          );

          return {
            ...vehicle,
            route: update.coordinates,
            totalEta: newTotalEta,
            eta: adjustedEta,
          };
        });

        return {
          ...current,
          vehicles: nextVehicles,
        };
      });
    });
  }, [game.incidents, game.stations, game.vehicles, game.weather, mapToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sourceId = "dispatch-route-preview";
    const selectedLayerId = "dispatch-route-preview-selected";
    const altLayerId = "dispatch-route-preview-alt";

    const clearLayers = () => {
      if (map.getLayer(selectedLayerId)) map.removeLayer(selectedLayerId);
      if (map.getLayer(altLayerId)) map.removeLayer(altLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };

    if (!routePreview || routePreview.routes.length === 0) {
      clearLayers();
      return;
    }

    const features = routePreview.routes.map((route) => ({
      type: "Feature" as const,
      properties: {
        key: route.key,
        color: route.color,
        isSelected: route.key === routePreview.selectedRouteKey ? 1 : 0,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: route.coordinates,
      },
    }));

    clearLayers();
    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });

    map.addLayer({
      id: altLayerId,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "isSelected"], 0],
      paint: {
        "line-color": ["get", "color"],
        "line-width": 4,
        "line-opacity": 0.55,
      },
    });
    map.addLayer({
      id: selectedLayerId,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "isSelected"], 1],
      paint: {
        "line-color": ["get", "color"],
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });
  }, [routePreview]);

  useEffect(() => {
    if (!mapRef.current) return;

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

    const depotCountries = new Set(
      game.stations
        .map((station) => findCountryByLocation(station.lat, station.lng)?.code)
        .filter((code): code is string => Boolean(code)),
    );

    depotCountries.forEach((countryCode) => {
      const depot = getCountryDepot(countryCode);
      const el = document.createElement("div");
      el.className = "relative flex h-8 w-8 items-start justify-center";
      el.title = `${findCountry(countryCode).name} Depot`;
      el.innerHTML = `
        <div style="position:relative;display:flex;height:24px;width:24px;align-items:center;justify-content:center;border-radius:7px;border:2px solid rgba(15,23,42,0.95);background:rgba(168,85,247,0.95);box-shadow:0 4px 10px rgba(15,23,42,0.5);font-size:12px;">🏭</div>
      `;
      stationMarkerRefs.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([depot.lng, depot.lat])
          .addTo(mapRef.current!),
      );
    });

    activeIncidents.forEach((incident) => {
      const phase = getIncidentMarkerPhase(incident, game.vehicles);
      const markerStyle = INCIDENT_MARKER_PHASE_STYLES[phase];
      if (phase === "RETURNING" || phase === "FILING") {
        return;
      }

      const el = document.createElement("button");
      el.className =
        "flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-950 text-white shadow-lg";
      el.style.backgroundColor = markerStyle.background;
      el.title = `${incident.title} (${markerStyle.label})`;
      el.innerHTML = "🔥";
      el.onclick = () => {
        setFocusedIncidentId(incident.id);
        mapRef.current?.flyTo({
          center: [incident.lng, incident.lat],
          zoom: Math.max(mapRef.current.getZoom(), 12),
          essential: true,
        });
      };

      incidentMarkerRefs.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([incident.lng, incident.lat])
          .addTo(mapRef.current!),
      );
    });

    deliveries.forEach((delivery) => {
      const [lng, lat] = getRoutePosition(
        delivery.route.length >= 2 ? delivery.route : [delivery.from, delivery.to],
        delivery.progress,
        { lat: delivery.to[1], lng: delivery.to[0] },
      );
      const existing = deliveryMarkerRefs.current.get(delivery.id);
      if (existing) {
        existing.setLngLat([lng, lat]);
        return;
      }

      const el = document.createElement("div");
      el.className = "relative flex h-8 w-8 items-start justify-center";
      el.innerHTML = `
        <div style="position:relative;display:flex;height:23px;width:23px;align-items:center;justify-content:center;border-radius:7px;border:2px solid rgba(15,23,42,0.95);background:rgba(168,85,247,0.95);box-shadow:0 4px 10px rgba(15,23,42,0.5);font-size:12px;">🚛</div>
      `;
      deliveryMarkerRefs.current.set(
        delivery.id,
        new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([lng, lat])
          .addTo(mapRef.current!),
      );
    });

    deliveryMarkerRefs.current.forEach((marker, id) => {
      if (!deliveries.find((delivery) => delivery.id === id)) {
        marker.remove();
        deliveryMarkerRefs.current.delete(id);
      }
    });

    game.vehicles.forEach((vehicle) => {
      const shouldRenderVehicle =
        (vehicle.status === "DISPATCHED" || vehicle.status === "RETURNING") &&
        vehicle.incidentId !== null;

      if (!shouldRenderVehicle) {
        vehicleMarkerRefs.current.get(vehicle.id)?.remove();
        vehicleMarkerRefs.current.delete(vehicle.id);
        vehicleProgressFloorRef.current.delete(vehicle.id);
        return;
      }

      const station = game.stations.find((s) => s.id === vehicle.stationId);
      const incident = game.incidents.find((i) => i.id === vehicle.incidentId);
      if (!station || !incident) {
        vehicleMarkerRefs.current.get(vehicle.id)?.remove();
        vehicleMarkerRefs.current.delete(vehicle.id);
        vehicleProgressFloorRef.current.delete(vehicle.id);
        return;
      }
      const progress =
        vehicle.status === "DISPATCHED" && vehicle.eta <= 0
          ? 0.999
          : getSmoothedProgress(vehicle);
      const fallback = vehicle.status === "DISPATCHED" ? station : incident;
      const fullRoute =
        vehicle.route.length >= 2
          ? vehicle.route
          : ([
              [station.lng, station.lat],
              [incident.lng, incident.lat],
            ] as [number, number][]);
      const [lng, lat] = getRoutePosition(fullRoute, progress, fallback);

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
    });

    if (isSelectingRealStation) {
      realStations.forEach((site) => {
        const el = document.createElement("button");
        el.className =
          "flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-100 bg-violet-500 text-white shadow-lg";
        el.innerHTML = "+";
        el.title = `Build at ${site.name}`;
        
        const handleRealStationSelect = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          const accepted = window.confirm(
            `Build ${STATION_TYPES[selectedBuild].label} station at ${site.name}?`,
          );
          if (!accepted) return;
          buildStationAt(site.lat, site.lng, selectedBuild);
          setIsSelectingRealStation(false);
          setBuildPickerOpen(false);
        };

        el.addEventListener("click", handleRealStationSelect);
        el.addEventListener("touchend", handleRealStationSelect, { passive: false });

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
    getSmoothedProgress,
    isSelectingRealStation,
    realStations,
    selectedBuild,
    deliveries,
  ]);

  useEffect(() => {
    let frameId = 0;

    const animateVehicles = () => {
      if (mapRef.current) {
        game.vehicles.forEach((vehicle) => {
          const moving =
            vehicle.status === "DISPATCHED" || vehicle.status === "RETURNING";
          if (!moving || vehicle.incidentId === null) return;

          const marker = vehicleMarkerRefs.current.get(vehicle.id);
          if (!marker) return;

          const station = game.stations.find((s) => s.id === vehicle.stationId);
          const incident = game.incidents.find((i) => i.id === vehicle.incidentId);
          if (!station || !incident) return;

          const progress =
            vehicle.status === "DISPATCHED" && vehicle.eta <= 0
              ? 0.999
              : getSmoothedProgress(vehicle);
          const fallback = vehicle.status === "DISPATCHED" ? station : incident;
          const fullRoute =
            vehicle.route.length >= 2
              ? vehicle.route
              : ([
                  [station.lng, station.lat],
                  [incident.lng, incident.lat],
                ] as [number, number][]);
          const [lng, lat] = getRoutePosition(fullRoute, progress, fallback);

          marker.setLngLat([lng, lat]);
        });
      }

      frameId = window.requestAnimationFrame(animateVehicles);
    };

    frameId = window.requestAnimationFrame(animateVehicles);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    game.incidents,
    game.stations,
    game.vehicles,
    getSmoothedProgress,
  ]);

  const chooseIncidentTemplates = useCallback(
    (state: GameState) => {
      if (missionCatalog.length === 0) return [] as SpawnableMission[];
      const todayKey = getCurrentDayKey();

      const availableVehicleCounts = state.vehicles.reduce(
        (counts, vehicle) => ({
          ...counts,
          [vehicle.type]: (counts[vehicle.type] ?? 0) + 1,
        }),
        {} as Partial<Record<VehicleType, number>>,
      );
      const activeSpecialMissionKeys = new Set(
        state.incidents
          .filter((incident) => incident.status !== "COMPLETE" && incident.isSpecialMission)
          .map((incident) => incident.missionKey)
          .filter((missionKey): missionKey is string => Boolean(missionKey)),
      );

      return missionCatalog
        .filter((mission) => meetsMissionPrerequisites(mission.prerequisites, state))
        .filter((mission) => {
          if (!isSpecialMissionDefinition(mission)) return true;
          const missionKey = `${state.activeCountryCode}:${mission.id}`;
          const alreadySpawnedToday = state.missionDailySpawns[missionKey] === todayKey;
          const hasActiveDuplicate = activeSpecialMissionKeys.has(missionKey);
          return !alreadySpawnedToday && !hasActiveDuplicate;
        })
        .map((mission) => missionToTemplate(mission, state))
        .filter((template): template is SpawnableMission => Boolean(template))
        .filter((template) => {
          return template.stages.every((stage) => {
            const requiredCounts = requirementCounts(stage.required);
            return Object.entries(requiredCounts).every(([type, count]) => {
              const owned = availableVehicleCounts[type as VehicleType] ?? 0;
              return owned >= (count ?? 0);
            });
          });
        });
    },
    [missionCatalog],
  );

  async function dispatch(vehicleId: number, incidentId: number, routeKey?: string) {
    const vehicle = game.vehicles.find((v) => v.id === vehicleId);
    const incident = game.incidents.find((i) => i.id === incidentId);
    if (!vehicle || !incident) return;

    const station = game.stations.find((s) => s.id === vehicle.stationId);
    if (!station) return;

    const routeOptions = await fetchRoadRoute(station, incident, mapToken, true);
    const selectedOption =
      Array.isArray(routeOptions) && routeKey
        ? routeOptions.find((_, idx) => `route-${idx + 1}` === routeKey)
        : null;
    const route = selectedOption ?? (Array.isArray(routeOptions) ? routeOptions[0] : routeOptions);
    const km = route?.distanceKm ?? haversineKm(station, incident);
    const weatherMultiplier = WEATHER_EFFECTS[game.weather].speedMultiplier;
    const traffic = getRushHourModifier();
    const dispatchUpgrade =
      1 + (station.upgrades.dispatchCenter ?? 0) * 0.06;
    const speed =
      VEHICLE_TYPES[vehicle.type].speedKmh *
      weatherMultiplier *
      traffic.trafficMultiplier *
      dispatchUpgrade;
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
        current.credits < DISPATCH_COST ||
        incident.assignedVehicleIds.includes(vehicleId)
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
                route:
                  roadRoute && roadRoute.length >= 2
                    ? roadRoute
                    : [
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

  async function loadRouteOptions(vehicleId: number, incidentId: number) {
    const vehicle = game.vehicles.find((entry) => entry.id === vehicleId);
    const incident = game.incidents.find((entry) => entry.id === incidentId);
    if (!vehicle || !incident) return [];
    const station = game.stations.find((entry) => entry.id === vehicle.stationId);
    if (!station) return [];

    const weatherMultiplier = WEATHER_EFFECTS[game.weather].speedMultiplier;
    const traffic = getRushHourModifier();
    const dispatchUpgrade = 1 + (station.upgrades.dispatchCenter ?? 0) * 0.06;
    const speed =
      VEHICLE_TYPES[vehicle.type].speedKmh *
      weatherMultiplier *
      traffic.trafficMultiplier *
      dispatchUpgrade;
    const colors = ["#ef4444", "#22c55e", "#3b82f6"];

    const routeOptions = await fetchRoadRoute(station, incident, mapToken, true);
    if (!Array.isArray(routeOptions)) return [];
    return routeOptions.slice(0, 3).map((route, idx) => ({
      key: `route-${idx + 1}`,
      label: `Route ${idx + 1}`,
      color: colors[idx] ?? "#a855f7",
      distanceKm: route.distanceKm,
      etaSeconds: Math.max(8, Math.round((route.distanceKm / speed) * 3600)),
      coordinates: route.coordinates,
    }));
  }

  async function dispatchRequiredVehicles(incident: Incident) {
    for (const requiredType of incident.stages[incident.currentStage]?.required ?? []) {
      const matchingVehicle = game.vehicles.find(
        (vehicle) =>
          vehicle.status === "AVAILABLE" &&
          vehicle.type === requiredType &&
          !incident.assignedVehicleIds.includes(vehicle.id),
      );
      if (!matchingVehicle) continue;
      await dispatch(matchingVehicle.id, incident.id);
    }
  }

  async function buyVehicle(stationId: number, type: VehicleType) {
    const station = game.stations.find((item) => item.id === stationId);
    if (!station) return;
    const stationCountry = findCountryByLocation(station.lat, station.lng);
    if (!stationCountry) return;
    const depot = getCountryDepot(stationCountry.code);
    const depotPoint = { lat: depot.lat, lng: depot.lng };
    const stationPoint = { lat: station.lat, lng: station.lng };
    const roadRouteResult = await fetchRoadRoute(depotPoint, stationPoint, mapToken, false);
    const roadRoute = Array.isArray(roadRouteResult) ? roadRouteResult[0] : roadRouteResult;
    const deliveryRoute =
      roadRoute?.coordinates && roadRoute.coordinates.length >= 2
        ? ([[depot.lng, depot.lat], ...roadRoute.coordinates.slice(1)] as [number, number][])
        : ([ [depot.lng, depot.lat], [station.lng, station.lat] ] as [number, number][]);

    const deliveryId = Date.now() + Math.floor(Math.random() * 1000);
    setDeliveries((current) => [
      ...current,
      {
        id: deliveryId,
        vehicleType: type,
        stationId,
        progress: 0,
        from: [depot.lng, depot.lat],
        to: [station.lng, station.lat],
        route: deliveryRoute,
      },
    ]);

    const deliveryDistanceKm = roadRoute?.distanceKm ?? haversineKm(depotPoint, stationPoint);
    const deliverySeconds = Math.max(6, Math.round(deliveryDistanceKm * 40));

    const interval = window.setInterval(() => {
      setDeliveries((current) =>
        current.map((delivery) =>
          delivery.id === deliveryId
            ? { ...delivery, progress: Math.min(1, delivery.progress + 1 / deliverySeconds) }
            : delivery,
        ),
      );
      }, 1000);

      window.setTimeout(() => {
      window.clearInterval(interval);
      setDeliveries((current) => current.filter((delivery) => delivery.id !== deliveryId));

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
        const used = current.vehicles.filter((v) => v.stationId === station.id).length;
        if (used >= stationCapacity(station)) return current;

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
            `Delivered ${vehicle.name} from ${findCountry(stationCountry.code).name} depot to ${station.name}.`,
            ...current.log,
          ].slice(0, 10),
        };
      });
    }, deliverySeconds * 1000);
  }

  function upgradeStationBranch(
    stationId: number,
    branch: keyof Station["upgrades"],
  ) {
    setGame((current) => {
      const station = current.stations.find((s) => s.id === stationId);
      if (!station) return current;
      const currentTier = station.upgrades[branch];
      const cost = Math.round((UPGRADE_BASE_COST * 0.4) + (currentTier + 1) * 10000);
      if (current.credits < cost) return current;

      return {
        ...current,
        credits: current.credits - cost,
        stations: current.stations.map((item) =>
          item.id === stationId
            ? {
                ...item,
                level: item.level + 1,
                upgrades: {
                  ...item.upgrades,
                  [branch]: item.upgrades[branch] + 1,
                },
              }
            : item,
        ),
        log: [
          `Upgraded ${station.name}: ${branch} tier ${currentTier + 1}.`,
          ...current.log,
        ].slice(0, 10),
      };
    });
  }

  function startTrainingCourse(stationId: number, course: "TRIAGE" | "TACTICS" | "COMM") {
    const costs = { TRIAGE: 1200, TACTICS: 1800, COMM: 1500 };
    const repGain = { TRIAGE: 1, TACTICS: 2, COMM: 1 };
    setGame((current) => {
      const station = current.stations.find((s) => s.id === stationId);
      if (!station) return current;
      const cost = costs[course];
      if (current.credits < cost) return current;
      return {
        ...current,
        credits: current.credits - cost,
        reputation: Math.min(100, current.reputation + repGain[course] + station.upgrades.trainingWing),
        log: [`Training completed: ${course} at ${station.name}.`, ...current.log].slice(0, 10),
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
      const now = Date.now();
      const elapsedTicks = Math.max(
        1,
        Math.floor((now - lastVehicleTickAtRef.current) / 1000),
      );
      lastVehicleTickAtRef.current = now;
      const spawnedNotifications: IncidentNotification[] = [];
      let earnedThisTick = 0;
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
              eta: Math.max(vehicle.eta - elapsedTicks, 0),
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
          const nextIncident = incident;
          if (nextIncident.status === "COMPLETE") return nextIncident;
          const stage = nextIncident.stages[nextIncident.currentStage];
          if (!stage) return nextIncident;

          const assignedVehicles = nextIncident.assignedVehicleIds
            .map((id) => nextVehicles.find((v) => v.id === id))
            .filter((v): v is Vehicle => Boolean(v));

          const finalStageComplete =
            nextIncident.currentStage >= nextIncident.stages.length - 1 &&
            nextIncident.stageWorkRemaining <= 0;

          if (!finalStageComplete) {
            const requiredCounts = requirementCounts(stage.required);
            const arrivedCounts = assignedVehicles.reduce(
              (counts, vehicle) => {
                if (!(vehicle.status === "DISPATCHED" && vehicle.eta <= 0)) {
                  return counts;
                }
                return {
                  ...counts,
                  [vehicle.type]: (counts[vehicle.type] ?? 0) + 1,
                };
              },
              {} as Partial<Record<VehicleType, number>>,
            );
            const hasAllRequired = Object.entries(requiredCounts).every(
              ([type, count]) =>
                (arrivedCounts[type as VehicleType] ?? 0) >= (count ?? 0),
            );
            if (!hasAllRequired) return nextIncident;
          }

          if (nextIncident.stageWorkRemaining > 0) {
            return {
              ...nextIncident,
              stageWorkRemaining: Math.max(
                nextIncident.stageWorkRemaining - elapsedTicks,
                0,
              ),
            };
          }

          const nextStage = nextIncident.currentStage + 1;
          if (nextStage >= nextIncident.stages.length) {
            const assignedIds = new Set(nextIncident.assignedVehicleIds);
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
                const returnKm = haversineKm(station, nextIncident);
                const weatherMultiplier =
                  WEATHER_EFFECTS[current.weather].speedMultiplier;
                const traffic = getRushHourModifier();
                const dispatchUpgrade =
                  1 + (station.upgrades.dispatchCenter ?? 0) * 0.06;
                const returnEta = Math.max(
                  8,
                  Math.round(
                    (returnKm /
                      (VEHICLE_TYPES[vehicle.type].speedKmh *
                        weatherMultiplier *
                        traffic.trafficMultiplier *
                        dispatchUpgrade)) *
                      3600,
                  ),
                );

                return {
                  ...vehicle,
                  status: "RETURNING" as VehicleStatus,
                  incidentId: nextIncident.id,
                  eta: returnEta,
                  totalEta: returnEta,
                  route: [
                    [nextIncident.lng, nextIncident.lat],
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
              ? Math.max(nextIncident.filingRemaining - elapsedTicks, 0)
              : nextIncident.filingRemaining;
            if (allBackAtStation && nextFiling === 0) {
              const missionCrewCost = assignedVehicles.reduce(
                (sum, vehicle) =>
                  sum + VEHICLE_TYPES[vehicle.type].crew * PAYROLL_PER_EMPLOYEE,
                0,
              );
              const trainingBonus = current.stations.reduce(
                (sum, station) => sum + station.upgrades.trainingWing,
                0,
              );
              const qualityMultiplier = 0.92 + current.reputation / 500;
              const trainingMultiplier =
                1 + Math.min(trainingBonus, 30) * 0.004;
              const payout = Math.round(
                nextIncident.reward * qualityMultiplier * trainingMultiplier,
              );
              creditsEarned += payout - missionCrewCost;
              progressNotes.push(
                `${nextIncident.title} completed (+${payout}, payroll -${missionCrewCost}).`,
              );
              return {
                ...nextIncident,
                status: "COMPLETE" as IncidentStatus,
                filingRemaining: 0,
                stageWorkRemaining: 0,
              };
            }

            return {
              ...nextIncident,
              filingRemaining: nextFiling,
              stageWorkRemaining: 0,
            };
          }

          progressNotes.push(
            `${nextIncident.title}: moved to stage ${nextStage + 1}.`,
          );
          return {
            ...nextIncident,
            currentStage: nextStage,
            stageWorkRemaining: STAGE_WORK_SECONDS,
            stageWorkTotal: STAGE_WORK_SECONDS,
          };
        });

        const activeCount = nextIncidents.filter(
          (incident) => incident.status !== "COMPLETE",
        ).length;
        const maxActiveIncidents = Math.max(1, current.vehicles.length);
        const weatherIncidentMultiplier =
          WEATHER_EFFECTS[current.weather].incidentMultiplier;

        const shouldSpawn =
          current.stations.length > 0 &&
          activeCount < maxActiveIncidents &&
          Math.random() <
            (activeCount < 1 ? 0.2 : 0.08) *
              weatherIncidentMultiplier *
              (1 + (50 - current.reputation) / 220);

        let finalIncidents = nextIncidents;
        let nextIncidentId = current.nextIncidentId;
        let nextResolvedCount = current.resolvedCount;
        const nextCredits = current.credits + creditsEarned;
        const nextMissionDailySpawns = { ...current.missionDailySpawns };

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
            const activeMissionIds = new Set(
              finalIncidents
                .filter((incident) => incident.status !== "COMPLETE")
                .map((incident) => incident.missionId)
                .filter((missionId): missionId is string => Boolean(missionId)),
            );
            const rotationPool = available.filter(
              (template) => !activeMissionIds.has(template.id),
            );
            const templatePool = rotationPool.length > 0 ? rotationPool : available;
            const template = templatePool[rand(0, templatePool.length - 1)];

            const primaryStage = template.stages[0];
            const candidateStations = current.stations.filter((station) =>
              stationSupportsRequiredTypes(
                station,
                primaryStage?.required ?? [],
                current.vehicles,
              ),
            );
            const anchorStations =
              candidateStations.length > 0 ? candidateStations : current.stations;
            const station =
              anchorStations[rand(0, anchorStations.length - 1)];
            const missionKey = `${current.activeCountryCode}:${template.id}`;
            const missionDef = missionCatalog.find((mission) => mission.id === template.id);
            const isSpecialMission = missionDef
              ? isSpecialMissionDefinition(missionDef)
              : Boolean(template.fixedLocation);
            const difficulty =
              1 +
              Math.floor(
                (nextResolvedCount + current.stations.length) / 4,
              );
            const { lat, lng } =
              template.fixedLocation ?? pickIncidentLocation(station);
            const incident: Incident = {
              id: nextIncidentId,
              missionId: template.id,
              missionKey,
              isSpecialMission,
              title: template.title,
              category: template.category,
              severity: difficulty,
              reward: calculateIncidentReward(
                template,
                difficulty,
                current.reputation,
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
            if (isSpecialMission) {
              nextMissionDailySpawns[missionKey] = getCurrentDayKey();
            }
            finalIncidents = [...finalIncidents, incident];
            progressNotes.unshift(`New incident: ${incident.title}.`);
            spawnedNotifications.push({
              id: incident.id,
              title: incident.title,
              category: incident.category,
              reward: incident.reward,
              severity: incident.severity,
              stageLabel: incident.stages[0]?.label ?? "Response",
              required: incident.stages[0]?.required ?? [],
            });
          }
        }

        const nextWeatherTimer = current.weatherTimer - elapsedTicks;
        const weatherChanged = nextWeatherTimer <= 0;
        const weatherPool: GameState["weather"][] = ["CLEAR", "RAIN", "SNOW", "HEAT"];
        const nextWeather = weatherChanged
          ? weatherPool[rand(0, weatherPool.length - 1)]
          : current.weather;
        const nextReputation = Math.max(
          0,
          Math.min(
            100,
            current.reputation +
              (creditsEarned > 0 ? 1 : 0) -
              (shouldSpawn && activeCount > maxActiveIncidents * 0.7 ? 1 : 0),
          ),
        );
        earnedThisTick = creditsEarned;

        return {
          ...current,
          credits: nextCredits,
          resolvedCount: nextResolvedCount,
          reputation: nextReputation,
          weather: nextWeather,
          weatherTimer: weatherChanged ? WEATHER_INTERVAL_SECONDS : nextWeatherTimer,
          missionDailySpawns: nextMissionDailySpawns,
          nextIncidentId,
          vehicles: nextVehicles,
          incidents: finalIncidents,
          log: [...progressNotes, ...current.log].slice(0, 10),
        };
      });
      if (spawnedNotifications.length > 0) {
        setIncidentNotifications((current) =>
          [...spawnedNotifications, ...current].slice(0, 3),
        );
      }
      if (earnedThisTick > 0) {
        const toastId = Date.now() + Math.floor(Math.random() * 1000);
        setIncomeToasts((current) => [...current, { id: toastId, amount: earnedThisTick }]);
        window.setTimeout(() => {
          setIncomeToasts((current) => current.filter((toast) => toast.id !== toastId));
        }, 2800);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [chooseIncidentTemplates, missionCatalog, pickIncidentLocation]);

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
  const trafficState = getRushHourModifier();
  const weatherState = WEATHER_EFFECTS[game.weather];

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

      <div className="absolute left-2 right-2 top-2 z-30 flex max-w-[min(96vw,820px)] flex-wrap items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-950/88 px-2 py-1.5 text-[11px] shadow-2xl backdrop-blur-sm [&_button]:h-6 [&_button]:px-2 sm:left-3 sm:right-auto sm:top-3 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-sm sm:[&_button]:h-7">
        <div className="relative">
          <Badge tone="good">
            <Coins className="mr-1 h-3 w-3" />
            Cash {game.credits}
          </Badge>
          <div className="pointer-events-none absolute -right-4 bottom-8 flex flex-col items-end gap-1">
            {incomeToasts.map((toast) => (
              <div key={toast.id} className="income-toast rounded-md bg-emerald-500/95 px-2 py-1 text-xs font-bold text-emerald-950 shadow">
                +{toast.amount}
              </div>
            ))}
          </div>
        </div>
        <Badge tone="blue">Weather {weatherState.label}</Badge>
        <Badge>Traffic {trafficState.label}</Badge>
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
        <Button size="sm" variant="outline" onClick={resetGame}>
          Reset
        </Button>
        {buildPickerOpen && (
          <div className="absolute left-0 top-[calc(100%+0.5rem)] w-[280px] rounded-xl border border-slate-700 bg-slate-900/90 p-2">
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
              onClick={() => {
                setIsSelectingRealStation(true);
                setBuildPickerOpen(false);
              }}
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
      </div>

      {selectedStation && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-3">
          <div className="w-full max-w-2xl rounded-2xl border border-sky-700/60 bg-slate-950/95 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
                  <Building2 className="h-3.5 w-3.5" />
                  Building Control
                </p>
                <h3 className="text-lg font-bold">{selectedStation.name}</h3>
                <p className="text-xs text-slate-400">
                  Level {selectedStation.level} • Capacity{" "}
                  {game.vehicles.filter((vehicle) => vehicle.stationId === selectedStation.id).length}
                  /{stationCapacity(selectedStation)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedStationId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-200 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="text-slate-400">Employees at station</p>
                <p className="text-base font-semibold">{stationEmployees[selectedStation.id] ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="text-slate-400">Total employees</p>
                <p className="text-base font-semibold">{game.employees}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                <p className="text-slate-400">Unassigned staff</p>
                <p className="text-base font-semibold">{unassignedEmployees}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={game.credits < Math.round((UPGRADE_BASE_COST * 0.4) + (selectedStation.upgrades.bayCapacity + 1) * 10000)}
                onClick={() => upgradeStationBranch(selectedStation.id, "bayCapacity")}
              >
                Bay +2 ({Math.round((UPGRADE_BASE_COST * 0.4) + (selectedStation.upgrades.bayCapacity + 1) * 10000)})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={game.credits < Math.round((UPGRADE_BASE_COST * 0.4) + (selectedStation.upgrades.dispatchCenter + 1) * 10000)}
                onClick={() => upgradeStationBranch(selectedStation.id, "dispatchCenter")}
              >
                Dispatch ({Math.round((UPGRADE_BASE_COST * 0.4) + (selectedStation.upgrades.dispatchCenter + 1) * 10000)})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={game.credits < Math.round((UPGRADE_BASE_COST * 0.4) + (selectedStation.upgrades.trainingWing + 1) * 10000)}
                onClick={() => upgradeStationBranch(selectedStation.id, "trainingWing")}
              >
                Training Wing ({Math.round((UPGRADE_BASE_COST * 0.4) + (selectedStation.upgrades.trainingWing + 1) * 10000)})
              </Button>
              <Button size="sm" variant="outline" disabled={game.credits < HIRING_COST} onClick={() => hireEmployee(1)}>
                <UserPlus className="mr-1 h-3.5 w-3.5" />
                Hire 1 ({HIRING_COST})
              </Button>
              <Button size="sm" variant="outline" disabled={game.credits < HIRING_COST * 5} onClick={() => hireEmployee(5)}>
                Hire 5 ({HIRING_COST * 5})
              </Button>
              <Button size="sm" variant="outline" disabled={game.credits < 2800} onClick={() => startTrainingCourse(selectedStation.id, "TRIAGE")}>
                Triage course (2800)
              </Button>
              <Button size="sm" variant="outline" disabled={game.credits < 4200} onClick={() => startTrainingCourse(selectedStation.id, "TACTICS")}>
                Command course (4200)
              </Button>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Vehicles in station
              </p>
              <div className="mb-2 grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
                {game.vehicles
                  .filter((vehicle) => vehicle.stationId === selectedStation.id)
                  .map((vehicle) => (
                    <p key={vehicle.id} className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1">
                      {vehicle.name} • {vehicle.status}
                    </p>
                  ))}
              </div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Buy vehicles
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(VEHICLE_TYPES) as VehicleType[])
                  .filter(
                    (type) =>
                      VEHICLE_TYPES[type].stationType === selectedStation.type &&
                      !disabledVehicleTypes.includes(type),
                  )
                  .map((type) => {
                    const config = VEHICLE_TYPES[type];
                    const usedCapacity = game.vehicles.filter(
                      (vehicle) => vehicle.stationId === selectedStation.id,
                    ).length;
                    const hasCapacity = usedCapacity < stationCapacity(selectedStation);
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
                        disabled={game.credits < config.cost || !hasCapacity || !hasStaff}
                        onClick={() => buyVehicle(selectedStation.id, type)}
                      >
                        <Icon className="mr-1 h-3.5 w-3.5" />
                        {config.label}
                      </Button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {incidentNotifications.length > 0 && (
        <div className="absolute left-2 right-2 top-[4.75rem] z-30 space-y-2 sm:left-3 sm:right-auto sm:top-auto sm:bottom-3 sm:w-[320px]">
          {incidentNotifications.map((notice) => (
            <div
              key={`${notice.id}-${notice.title}`}
              className="rounded-xl border border-rose-500/60 bg-slate-950/95 p-3 shadow-xl backdrop-blur-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">
                  Incoming incident
                </p>
                <button
                  type="button"
                  className="text-slate-400 transition hover:text-slate-100"
                  onClick={() =>
                    setIncidentNotifications((current) =>
                      current.filter((item) => item.id !== notice.id),
                    )
                  }
                  aria-label="Dismiss incident notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-1 text-sm font-semibold text-slate-100">{notice.title}</p>
              <p className="mt-1 text-xs text-slate-300">
                Type: {notice.category} • Severity: {notice.severity} • Reward: {notice.reward}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Stage: {notice.stageLabel} • Required: {notice.required.join(", ") || "Any"}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const incident = game.incidents.find((item) => item.id === notice.id);
                    if (incident) void dispatchRequiredVehicles(incident);
                  }}
                >
                  Dispatch now
                </Button>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const incident = game.incidents.find((item) => item.id === notice.id);
                    if (!incident) return;
                    mapRef.current?.flyTo({
                      center: [incident.lng, incident.lat],
                      zoom: Math.max(mapRef.current.getZoom(), 12),
                      essential: true,
                    });
                    setFocusedIncidentId(notice.id);
                    setIncidentNotifications((current) =>
                      current.filter((item) => item.id !== notice.id),
                    );
                  }}
                >
                  Focus on map
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LiveIncidentsPanel
        activeIncidents={activeIncidents}
        focusedIncidentId={focusedIncidentId}
        missionProgress={(incident) => missionProgress(incident as Incident)}
        vehicles={game.vehicles}
        credits={game.credits}
        dispatchCost={DISPATCH_COST}
        onDispatchVehicle={dispatch}
        onLoadRouteOptions={loadRouteOptions}
        onRoutePreviewChange={setRoutePreview}
        incomingDeliveries={deliveries.map((delivery) => ({
          id: delivery.id,
          vehicleType: delivery.vehicleType,
        }))}
      />
    </main>
  );
}
