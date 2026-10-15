export abstract class PasswordHasher {
  abstract hash(value: string): Promise<string>;
  abstract verify(digest: string, value: string): Promise<boolean>;
}
export type AccessClaims = {
  userId: string;
  sessionId: string;
  authorizationVersion: number;
};
export abstract class SessionTokens {
  abstract sign(claims: AccessClaims): Promise<string>;
  abstract verify(jwt: string): Promise<AccessClaims>;
  abstract refreshToken(): string;
  abstract digest(token: string): string;
}
