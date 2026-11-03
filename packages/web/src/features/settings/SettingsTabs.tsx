import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { t } from "@/i18n";

import { EmailSettings } from "./EmailSettings";
import { LocationSettings } from "./LocationSettings";

/** The Settings page's areas, one tab each; the open tab is kept in the URL. */
export function SettingsTabs() {
  const { tab } = useSearch({ from: "/_authenticated/settings" });
  const navigate = useNavigate({ from: "/settings" });

  return (
    <Tabs
      value={tab}
      onValueChange={(value: typeof tab) => void navigate({ search: { tab: value } })}
    >
      <TabsList>
        <TabsTab value="email">{t("settings.email.title")}</TabsTab>
        <TabsTab value="locations">{t("settings.locations.title")}</TabsTab>
      </TabsList>
      <TabsPanel value="email">
        <EmailSettings />
      </TabsPanel>
      <TabsPanel value="locations">
        <LocationSettings />
      </TabsPanel>
    </Tabs>
  );
}
