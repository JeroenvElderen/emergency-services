export type VehicleType =
  | "ENGINE"
  | "LADDER"
  | "AMBULANCE"
  | "RESCUE"
  | "PATROL"
  | "SWAT";

export type IncidentCategory = "FIRE" | "EMS" | "POLICE";
export type VehicleStatus = "AVAILABLE" | "DISPATCHED" | "RETURNING";
export type IncidentStatus = "OPEN" | "RESPONDING" | "COMPLETE";