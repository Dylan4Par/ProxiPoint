import { useEffect, useState } from 'react';
import { getCampaigns, subscribeCampaigns, type Campaign } from '../lib/campaigns';

/** Your campaigns, re-rendering when they change. */
export function useCampaigns(): Campaign[] {
  const [value, setValue] = useState(getCampaigns);
  useEffect(() => {
    const update = () => setValue(getCampaigns());
    update();
    return subscribeCampaigns(update);
  }, []);
  return value;
}
