import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import AuditStopPage from './pages/AuditStop';
import CarriersPage from './pages/Carriers';
import DispatchMapPage from './pages/DispatchMap';
import ClinicsPage from './pages/Clinics';
import DashboardPage from './pages/Dashboard';
import DispatchersPage from './pages/Dispatchers';
import DriverDayPage from './pages/DriverDay';
import FinancialsPage from './pages/Financials';
import PickupSheetPage from './pages/PickupSheet';
import GuidePage from './pages/Guide';
import ReportsPage from './pages/Reports';
import DriversPage from './pages/Drivers';
import RouteDetailPage from './pages/RouteDetail';
import RoutesPage from './pages/Routes';
import StatesPage from './pages/States';
import StopsPage from './pages/Stops';
import TrendsPage from './pages/Trends';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'sheet', element: <PickupSheetPage /> },
      { path: 'map', element: <DispatchMapPage /> },
      { path: 'routes', element: <RoutesPage /> },
      { path: 'routes/:id', element: <RouteDetailPage /> },
      { path: 'routes/:routeId/stops/:stopId/audit', element: <AuditStopPage /> },
      { path: 'stops', element: <StopsPage /> },
      { path: 'financials', element: <FinancialsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'trends', element: <TrendsPage /> },
      { path: 'driver-day', element: <DriverDayPage /> },
      { path: 'clinics', element: <ClinicsPage /> },
      { path: 'drivers', element: <DriversPage /> },
      { path: 'dispatchers', element: <DispatchersPage /> },
      { path: 'carriers', element: <CarriersPage /> },
      { path: 'states', element: <StatesPage /> },
      { path: 'guide', element: <GuidePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
