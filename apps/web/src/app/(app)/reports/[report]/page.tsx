'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ReportsHubPage from '../page';

export default function SingleReportRedirect() {
  const params = useParams<{ report: string }>();
  return <ReportsHubPage />;
}
