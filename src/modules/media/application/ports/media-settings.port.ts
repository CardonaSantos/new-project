export abstract class MediaSettingsPort {
  abstract readonly region: string;
  abstract readonly bucket: string;
  abstract readonly prefix: string;
  abstract readonly maxDirectBytes: number;
  abstract readonly maxVideoBytes: number;
}
