# Emergency Services

## Mission JSON guide

Mission files live in `public/missions/` (for example `default.json`, `DE.json`, `FR.json`).
Each file is an array of mission objects.

### Mission shape

```json
{
  "id": "100",
  "name": "Bus Stop Waste Bin Fire",
  "average_credits": 480,
  "reward_floor": 320,
  "reward_ceiling": 820,
  "requirements": {
    "firetrucks": 1
  },
  "prerequisites": {
    "fire_stations": 1
  },
  "stages": [
    {
      "label": "Escalation",
      "prerequisites": {
        "fire_stations": 3
      },
      "requirements": {
        "firetrucks": 2
      }
    }
  ],
  "mission_categories": ["fire", "urban"]
}
```

## Field reference

- `id` (string): Unique mission id.
- `name` (string): Mission display title.
- `average_credits` (number): Baseline mission value used for reward simulation.
- `reward_floor` (number, optional): Minimum spawn reward for this mission.
- `reward_ceiling` (number, optional): Maximum spawn reward for this mission.
- `requirements` (object): Required vehicle counts for stage 1.
- `prerequisites` (object, optional): Conditions needed for the mission to spawn.
- `stages` (array, optional): Extra stages appended to this mission.
- `mission_categories` (array): Must include at least one supported category (`fire`, `ems`, or `police`).

## Requirement keys

Requirements can be written in multiple forms:

- Legacy keys (still supported): `firetrucks`, `platform_trucks`, `ambulances`, `rescue_vehicles`, `police_cars`, `swat`
- Vehicle type ids: `ENGINE`, `LADDER`, `AMBULANCE`, `RESCUE`, `PATROL`, `SWAT`
- Singular/plural label-style forms: `engine`, `engines`, `ambulance`, `ambulances`, etc.

Requirement values are counts:

```json
"requirements": {
  "firetrucks": 2,
  "ambulances": 1
}
```

## Prerequisites

Supported prerequisite keys:

- `fire_stations`
- `ambulance_stations`
- `police_stations`

These keys can be used at:

- mission level (`mission.prerequisites`) to enable/disable the whole mission
- stage level (`mission.stages[i].prerequisites`) to conditionally add that extra stage

Example:

```json
"prerequisites": {
  "fire_stations": 2
}
```

## How staging works

1. Base stage is created from the top-level `requirements`.
2. Each entry in `stages` is checked in order.
3. If a stage's `prerequisites` pass, that stage is added.
4. If they do not pass, that stage is skipped.

This lets you scale mission complexity by player progress (for example, more fire stations = extra stage requiring more trucks).

## Vehicle JSON guide

Vehicle config lives in `public/vehicles.json`.

Each entry maps one in-game vehicle type and can override default values:

```json
{
  "id": "ENGINE",
  "label": "Engine",
  "station_type": "FIRE",
  "cost": 5000,
  "speed_kmh": 55,
  "crew": 4,
  "enabled": true
}
```

### Vehicle fields

- `id`: Vehicle type id (`ENGINE`, `LADDER`, `AMBULANCE`, `RESCUE`, `PATROL`, `SWAT`)
- `label` (optional): Display name override
- `station_type` (optional): Which station can buy it (`FIRE`, `EMS`, `POLICE`)
- `cost` (optional): Purchase cost
- `speed_kmh` (optional): Travel speed used for ETA
- `crew` (optional): Required employees
- `enabled` (optional): Set `false` to hide from purchase menu

If `public/vehicles.json` is missing, built-in defaults are used.

## Local development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```
