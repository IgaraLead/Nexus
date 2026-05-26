import { Card, CardDescription, CardHeader, CardTitle } from '@igaralead/ui';

import { DocumentPageFrame, PageHeader } from '../components/layout';

export const PlaceholderPage = () => (
  <DocumentPageFrame>
    <PageHeader
      title="Tela planejada para o React"
      description="Esta rota ja esta no shell isolado, mas ainda sera conectada aos contratos de dominio do Nexus."
    />
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Pronto para evoluir</CardTitle>
        <CardDescription>Use esta area para desenvolver a proxima tela sem tocar no dashboard Vue.</CardDescription>
      </CardHeader>
    </Card>
  </DocumentPageFrame>
);
