import type {
  Branch,
  BranchAccess,
  BranchChanges,
  BranchConfig,
  BranchOverview,
  Company,
  CompanyChanges,
  ConfigChanges,
  Device,
  DeviceChanges,
  DeviceFilter,
  DeviceType,
  ListFilter,
  Paged,
} from '../../domain/organization.types.js';

export interface AccessScope {
  global: boolean;
  branchIds: string[];
}
export abstract class OrganizationRepositoryPort {
  abstract company(): Promise<Company | null>;
  abstract updateCompany(
    actorId: string,
    changes: CompanyChanges,
  ): Promise<Company>;
  abstract branchScope(
    userId: string,
    permission: string,
  ): Promise<AccessScope>;
  abstract myBranches(userId: string): Promise<BranchAccess[]>;
  abstract listBranches(
    filter: ListFilter,
    scope: AccessScope,
  ): Promise<Paged<Branch>>;
  abstract branchOptions(
    filter: { search?: string; cursor?: string; limit: number },
    scope: AccessScope,
  ): Promise<{
    data: Array<{
      id: string;
      label: string;
      codigo: string;
      zonaHoraria: string;
    }>;
    nextCursor: string | null;
  }>;
  abstract branch(id: string): Promise<Branch | null>;
  abstract branchOverview(id: string): Promise<BranchOverview>;
  abstract createBranch(
    actorId: string,
    input: {
      codigo: string;
      nombre: string;
      direccion?: string;
      telefono?: string;
      zonaHoraria?: string;
    },
  ): Promise<Branch>;
  abstract updateBranch(
    actorId: string,
    id: string,
    changes: BranchChanges,
  ): Promise<Branch>;
  abstract changeBranchStatus(
    actorId: string,
    id: string,
    active: boolean,
    reason: string,
  ): Promise<Branch>;
  abstract branchConfig(id: string): Promise<BranchConfig | null>;
  abstract updateBranchConfig(
    actorId: string,
    id: string,
    changes: ConfigChanges,
  ): Promise<BranchConfig>;
  abstract listDevices(
    filter: DeviceFilter,
    scope: AccessScope,
  ): Promise<Paged<Device>>;
  abstract deviceOptions(
    filter: {
      search?: string;
      cursor?: string;
      limit: number;
      sucursalId?: string;
      tipo?: DeviceType;
    },
    scope: AccessScope,
  ): Promise<{
    data: Array<{
      id: string;
      label: string;
      codigo: string;
      tipo: DeviceType;
      sucursalId: string;
    }>;
    nextCursor: string | null;
  }>;
  abstract device(id: string): Promise<Device | null>;
  abstract createDevice(
    actorId: string,
    input: {
      sucursalId: string;
      codigo: string;
      nombre: string;
      tipo: DeviceType;
      estacionPreparacionId?: string | null;
    },
  ): Promise<Device>;
  abstract updateDevice(
    actorId: string,
    id: string,
    changes: DeviceChanges,
  ): Promise<Device>;
  abstract changeDeviceStatus(
    actorId: string,
    id: string,
    active: boolean,
    reason: string,
  ): Promise<Device>;
}
