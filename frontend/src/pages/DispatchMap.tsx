import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api/client';
import type { CutoffStatus, DispatchMapData, DispatchMapRoute, Stop } from '../types';
import {
  Badge,
  Button,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui';
import {
  CUTOFF_STATUS,
  ROUTE_STATUS,
  fmtClock,
  fmtDateTime,
  toFloat,
} from '../lib/format';

const STOP_COLORS: Record<CutoffStatus, string> = {
  ok: '#10b981',
  at_risk: '#f59e0b',
  breached: '#ef4444',
  na: '#94a3b8',
};

function stopIcon(seq: number, status: CutoffStatus): L.DivIcon {
  return L.divIcon({
    className: 'agl-marker',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${STOP_COLORS[status]};color:#fff;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)">${seq}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  });
}

const driverIcon = L.divIcon({
  className: 'agl-marker',
  html: '<div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:9999px;background:#4f46e5;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:17px">🚚</div>',
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -22],
});

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48] });
  }, [map, points]);
  return null;
}

function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function EtaCountdown({ eta, skew, now }: { eta: string | null; skew: number; now: number }) {
  if (!eta) return <span className="text-slate-400">—</span>;
  const target = Date.parse(eta) + skew;
  const remaining = target - now;
  const clock = new Date(target).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (remaining < -60_000) return <span>{fmtDateTime(eta)}</span>;
  if (remaining <= 60_000) return <span className="font-semibold text-red-600">due · {clock}</span>;
  const mins = Math.round(remaining / 60000);
  return (
    <span>
      {clock} · in <span className="font-semibold text-indigo-600">{mins}m</span>
    </span>
  );
}

function RouteCard({
  item,
  skew,
  now,
  saving,
  onUpdateLocation,
}: {
  item: DispatchMapRoute;
  skew: number;
  now: number;
  saving: boolean;
  onUpdateLocation: (driverId: number, lat: number, lng: number) => void;
}) {
  const [atStop, setAtStop] = useState('');
  const [lat, setLat] = useState(item.driver.current_lat != null ? String(item.driver.current_lat) : '');
  const [lng, setLng] = useState(item.driver.current_lng != null ? String(item.driver.current_lng) : '');

  const next = item.next_stop;

  const pickStop = (stopId: string) => {
    setAtStop(stopId);
    const stop = item.stops.find((s) => s.id === Number(stopId));
    if (stop && stop.lat != null && stop.lng != null) {
      setLat(String(stop.lat));
      setLng(String(stop.lng));
      onUpdateLocation(item.driver.id, stop.lat, stop.lng);
    }
  };

  const submitManual = () => {
    const la = toFloat(lat);
    const ln = toFloat(lng);
    if (la == null || ln == null || la < -90 || la > 90 || ln < -180 || ln > 180) return;
    onUpdateLocation(item.driver.id, la, ln);
  };

  return (
    <div className={`card p-4 ${item.projected_state_cutoff_risk ? 'border-amber-300' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/routes/${item.route.id}`}
          className="font-mono text-sm font-bold text-indigo-600 hover:underline"
        >
          Route #{item.route.id}
        </Link>
        <Badge tone={ROUTE_STATUS[item.route.status].tone}>{ROUTE_STATUS[item.route.status].label}</Badge>
      </div>
      <p className="mt-1 text-sm font-medium text-slate-900">{item.driver.name}</p>
      <p className="text-xs text-slate-400">
        {item.driver.vehicle ?? '—'} · last update{' '}
        {item.driver.location_updated_at ? fmtClock(item.driver.location_updated_at) : 'never'}
      </p>

      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Next stop</span>
          <span className="text-right text-slate-800">
            {next ? `${next.sequence}. ${next.location_label ?? '—'}` : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">ETA next</span>
          <span className="text-right font-medium">
            <EtaCountdown eta={next?.projected_arrival ?? null} skew={skew} now={now} />
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Final ETA</span>
          <span className="text-right font-medium">
            <EtaCountdown eta={item.projected_final_eta} skew={skew} now={now} />
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">State cutoff</span>
          <span className="text-right text-slate-800">{fmtClock(item.state_cutoff)}</span>
        </div>
      </div>

      {item.projected_state_cutoff_risk && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          ⚠ Projected to miss the state cutoff — live warning only. The formal
          Major violation is logged when the route closes late.
        </p>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Driver location (manual)
        </p>
        <Field label="Driver is at…">
          <Select value={atStop} onChange={(e) => pickStop(e.target.value)}>
            <option value="">Select current stop…</option>
            {item.stops
              .filter((s) => s.lat != null && s.lng != null)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sequence}. {s.location_label ?? '—'}
                </option>
              ))}
          </Select>
        </Field>
        <div className="mt-2 flex gap-2">
          <Input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="Lat"
            className="!py-1.5 font-mono text-xs"
          />
          <Input
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="Lng"
            className="!py-1.5 font-mono text-xs"
          />
          <Button
            variant="secondary"
            className="!px-3 !py-1.5 text-xs"
            disabled={saving}
            onClick={submitManual}
          >
            {saving ? '…' : 'Update'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DispatchMapPage() {
  const [data, setData] = useState<DispatchMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const now = useNow(30000);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.dispatch.map());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dispatch map.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const updateLocation = async (driverId: number, lat: number, lng: number) => {
    setSavingId(driverId);
    setError(null);
    try {
      await api.drivers.updateLocation(driverId, lat, lng);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update location.');
    } finally {
      setSavingId(null);
    }
  };

  // Correct for the server clock vs browser clock so countdowns are accurate.
  const skew = useMemo(
    () => (data ? Date.now() - Date.parse(data.generated_at) : 0),
    [data],
  );

  const points = useMemo(() => {
    const pts: Array<[number, number]> = [];
    for (const item of data?.routes ?? []) {
      if (item.driver.current_lat != null && item.driver.current_lng != null) {
        pts.push([item.driver.current_lat, item.driver.current_lng]);
      }
      for (const s of item.stops) {
        if (s.lat != null && s.lng != null) pts.push([s.lat, s.lng]);
      }
    }
    return pts;
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Dispatch Map"
        subtitle="Live US-wide view — driver locations are entered manually; ETAs and cutoff risk recalculate on every update."
        actions={
          data ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Badge tone="indigo">{data.active_route_count} routes</Badge>
              <Badge tone={data.at_risk_count > 0 ? 'amber' : 'emerald'}>
                {data.at_risk_count} at risk
              </Badge>
              <span className="text-xs text-slate-400">auto-refresh 60s</span>
            </div>
          ) : undefined
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Loading dispatch map…" />
      ) : !data || data.routes.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-slate-500">
          No active routes. Planned or active routes appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <div className="relative h-[calc(100vh-190px)] min-h-[480px] overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <MapContainer
              center={[38.0, -79.5]}
              zoom={7}
              className="h-full w-full"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds points={points} />
              {data.routes.map((item) => {
                const polyline: Array<[number, number]> = [];
                if (item.driver.current_lat != null && item.driver.current_lng != null) {
                  polyline.push([item.driver.current_lat, item.driver.current_lng]);
                }
                for (const s of item.stops) {
                  if (s.lat != null && s.lng != null) polyline.push([s.lat, s.lng]);
                }
                return (
                  <span key={item.route.id}>
                    {polyline.length >= 2 && (
                      <Polyline
                        positions={polyline}
                        pathOptions={{
                          color: item.projected_state_cutoff_risk ? '#f59e0b' : '#6366f1',
                          weight: 3,
                          opacity: 0.7,
                          dashArray: item.route.status === 'planned' ? '6 6' : undefined,
                        }}
                      />
                    )}
                    {item.driver.current_lat != null && item.driver.current_lng != null && (
                      <Marker
                        position={[item.driver.current_lat, item.driver.current_lng]}
                        icon={driverIcon}
                      >
                        <Popup>
                          <div className="min-w-[180px] text-xs">
                            <p className="text-sm font-bold">{item.driver.name}</p>
                            <p className="text-slate-500">
                              Route #{item.route.id} · {item.route.status}
                            </p>
                            <p className="mt-1">
                              <span className="text-slate-500">Next:</span>{' '}
                              <EtaCountdown
                                eta={item.next_stop?.projected_arrival ?? null}
                                skew={skew}
                                now={now}
                              />
                            </p>
                            <p>
                              <span className="text-slate-500">Final:</span>{' '}
                              <EtaCountdown eta={item.projected_final_eta} skew={skew} now={now} />
                            </p>
                            {item.projected_state_cutoff_risk && (
                              <p className="mt-1 font-semibold text-amber-700">
                                ⚠ Projected to miss state cutoff
                              </p>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    )}
                    {item.stops.map((s) =>
                      s.lat != null && s.lng != null ? (
                        <Marker
                          key={s.id}
                          position={[s.lat, s.lng]}
                          icon={stopIcon(s.sequence, s.cutoff_status)}
                        >
                          <Popup>
                            <div className="min-w-[180px] text-xs">
                              <p className="text-sm font-bold">{s.location_label ?? 'Stop'}</p>
                              <p className="text-slate-500">
                                {s.stop_type === 'pickup' ? 'Pickup' : 'Delivery'} · stop {s.sequence}
                              </p>
                              <p className="mt-1">
                                <Badge tone={CUTOFF_STATUS[s.cutoff_status].tone}>
                                  {CUTOFF_STATUS[s.cutoff_status].label}
                                </Badge>
                              </p>
                              <p className="mt-1">
                                <span className="text-slate-500">Cutoff:</span>{' '}
                                {fmtClock(s.stop_type === 'pickup' ? s.clinic_cutoff : s.carrier_cutoff)}
                              </p>
                              <p>
                                <span className="text-slate-500">ETA:</span>{' '}
                                <EtaCountdown eta={s.projected_arrival} skew={skew} now={now} />
                              </p>
                            </div>
                          </Popup>
                        </Marker>
                      ) : null,
                    )}
                  </span>
                );
              })}
            </MapContainer>
            {/* Legend */}
            <div className="absolute right-3 top-3 z-[1000] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow">
              <p className="mb-1 font-semibold text-slate-600">Cutoff status</p>
              {(Object.keys(STOP_COLORS) as CutoffStatus[]).map((k) => (
                <div key={k} className="flex items-center gap-2 py-0.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: STOP_COLORS[k] }}
                  />
                  <span className="text-slate-600">{CUTOFF_STATUS[k].label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 overflow-y-auto lg:max-h-[calc(100vh-190px)] lg:pr-1">
            {data.routes.map((item) => (
              <RouteCard
                key={item.route.id}
                item={item}
                skew={skew}
                now={now}
                saving={savingId === item.driver.id}
                onUpdateLocation={updateLocation}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
