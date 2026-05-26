import { Badge, Button, IgaraAppShell, type IgaraNavItem } from '@igaralead/ui';
import { BarChart3, Building2, Inbox, MessageSquare, Settings, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

const isActivePath = (activePath: string, href: string) => (href === '/' ? activePath === '/' : activePath.startsWith(href));

const createNavItems = (navigate: NavigateFunction, activePath: string): IgaraNavItem[] => [
  { label: 'My Inbox', icon: Inbox, active: isActivePath(activePath, '/'), onClick: () => navigate('/') },
  {
    label: 'Conversations',
    icon: MessageSquare,
    active: isActivePath(activePath, '/conversations'),
    onClick: () => navigate('/conversations'),
    children: [
      {
        label: 'All Conversations',
        active: isActivePath(activePath, '/conversations/all'),
        onClick: () => navigate('/conversations/all'),
      },
      {
        label: 'Mentions',
        active: isActivePath(activePath, '/conversations/mentions'),
        onClick: () => navigate('/conversations/mentions'),
      },
      {
        label: 'Participating',
        active: isActivePath(activePath, '/conversations/participating'),
        onClick: () => navigate('/conversations/participating'),
      },
      {
        label: 'Unattended',
        active: isActivePath(activePath, '/conversations/unattended'),
        onClick: () => navigate('/conversations/unattended'),
      },
    ],
  },
  {
    label: 'Channels',
    icon: Inbox,
    active: isActivePath(activePath, '/channels'),
    onClick: () => navigate('/channels'),
    children: [
      {
        label: 'Acme Support',
        active: isActivePath(activePath, '/channels/acme-support'),
        onClick: () => navigate('/channels/acme-support'),
      },
      { label: 'teste', active: isActivePath(activePath, '/channels/teste'), onClick: () => navigate('/channels/teste') },
    ],
  },
  { label: 'Contacts', icon: Building2, active: isActivePath(activePath, '/contacts'), onClick: () => navigate('/contacts') },
  { label: 'Reports', icon: BarChart3, active: isActivePath(activePath, '/reports'), onClick: () => navigate('/reports') },
  { label: 'Settings', icon: Settings, active: isActivePath(activePath, '/settings'), onClick: () => navigate('/settings') },
];

const getInitials = (name?: string) => {
  if (!name) return 'NX';

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
};

type NexusShellProps = {
  activePath: string;
  children: React.ReactNode;
};

export const NexusShell = ({ activePath, children }: NexusShellProps) => {
  const navigate = useNavigate();
  const installationName = window.globalConfig?.INSTALLATION_NAME || 'Nexus';
  const productSurface = window.chatwootConfig?.productSurface || {};
  const legacyNexusUrl = import.meta.env.VITE_NEXUS_URL || 'http://localhost:3000/app';
  const navItems = React.useMemo(() => createNavItems(navigate, activePath), [activePath, navigate]);

  return (
    <IgaraAppShell
      activePath={activePath}
      actions={
        <>
          {productSurface.whatsappBaileys ? (
            <Badge variant="success" className="hidden sm:inline-flex">
              <ShieldCheck className="size-3.5" />
              WhatsApp ativo
            </Badge>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <a href={legacyNexusUrl}>Nexus atual</a>
          </Button>
        </>
      }
      brand="Nexus"
      className="nexus-next"
      contentClassName="box-border h-[100dvh] min-h-0 w-full max-w-none overflow-hidden p-0 pt-14 sm:px-0 lg:px-0"
      footerDescription="Vue permanece fora deste container"
      footerTitle="Interface paralela"
      logo={
        <img
          src="/igaralead-logo.svg"
          alt="IgaraLead"
          width={30}
          height={30}
          className="inline-block align-middle"
        />
      }
      navItems={navItems}
      searchPlaceholder="Search..."
      sidebarLabel="Menu"
      subtitle="Nexus Next"
      userInitials={getInitials(installationName)}
      onSearchChange={() => undefined}
    >
      {children}
    </IgaraAppShell>
  );
};
