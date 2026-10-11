import { redirect } from 'next/navigation';

export default function DashboardHomePage() {
  // Por defecto en operaciones de restaurante, la vista primaria es el KDS de Cocina
  redirect('/kds');
}
