import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@igaralead/ui';

import { DocumentPageFrame, PageHeader, PageSection } from '../components/layout';
import { useAccountSettings, useUpdateAccountSettings } from '../features/settings/api';

export const SettingsPage = () => {
  const { data: accountSettings } = useAccountSettings();
  const updateAccountSettings = useUpdateAccountSettings();

  return (
    <DocumentPageFrame>
    <div className="max-w-2xl">
      <PageHeader title="General settings" />

      <div className="mt-3">
        <PageSection
          title="Account details"
          description="Configuracoes gerais da conta, alinhadas ao layout estreito do Vue."
          className="!pt-0"
        >
          <form className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="account-name">Account name</Label>
              <Input id="account-name" defaultValue={accountSettings.name} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="site-language">Site language</Label>
              <Select defaultValue={accountSettings.locale}>
                <SelectTrigger id="site-language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Portuguese (Brazil)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="support-email">Support email</Label>
              <Input id="support-email" placeholder="support@example.com" />
            </div>
            <div>
              <Button type="button" onClick={() => updateAccountSettings.mutate({ name: accountSettings.name })}>
                Update settings
              </Button>
            </div>
          </form>
        </PageSection>

        <PageSection title="Account ID" description="Identificador usado por rotas e adapters.">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-mono text-sm text-foreground">{accountSettings.id}</p>
          </div>
        </PageSection>

        <PageSection title="Build info" description="Informacoes visuais equivalentes ao bloco BuildInfo do Vue.">
          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-foreground">{window.globalConfig?.APP_VERSION || 'local'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Frontend</span>
              <span className="font-mono text-foreground">nexus-next-frontend</span>
            </div>
          </div>
        </PageSection>
      </div>
    </div>
    </DocumentPageFrame>
  );
};
