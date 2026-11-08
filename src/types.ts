/** Shapes returned by the server (see bus_tracker/core/serializers.py). */

export interface Organization {
  id: number;
  name: string;
  slug: string;
  campus: {name: string; lat: number; lon: number} | null;
  map_zoom: number;
  timezone: string;
}

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'driver' | 'student';
  must_change_password: boolean;
  organization: Organization | null;
}

export interface Session {
  access: string;
  refresh: string;
  user: User;
}

export type TripStatus = 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

export interface Trip {
  id: number;
  trip_id: number;
  status: TripStatus;
  bus: {id: number; registration_no: string; name: string};
  route: {id: number; name: string};
  driver: {id: number; name: string; username: string; phone: string} | null;
  created_at: string | null;
  start_time: string | null;
  end_time: string | null;
  has_issue: boolean;
  issue_text: string;
  issue_reported_at: string | null;
  last_ping_at: string | null;
  location: {
    lat: number;
    lon: number;
    speed: number | null;
    heading: number | null;
    recorded_at: string | null;
    updated_at: string | null;
  } | null;
}

export interface DriverTrips {
  ongoing: Trip | null;
  scheduled: Trip[];
  recent: Trip[];
}

export interface BusOption {
  id: number;
  registration_no: string;
  name: string;
  default_route_id: number | null;
  busy: boolean;
}

export interface RouteOption {
  id: number;
  name: string;
}

export interface DriverOptions {
  buses: BusOption[];
  routes: RouteOption[];
}

export interface PingPayload {
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  /** Epoch milliseconds from the GPS fix. */
  recorded_at: number;
}

export interface PingResult {
  accepted: number;
  ignored: number;
  trip_id: number;
  status: TripStatus;
}
