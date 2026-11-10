type PasswordError = {code?: string; message?: string};

export function patientPasswordError(error: PasswordError, fallback: string): string {
  const message = error.message || '';
  const minimum = message.match(/password should be at least (\d+) characters/i);
  if (minimum) return `O serviço de login exige pelo menos ${minimum[1]} caracteres na senha.`;
  const maximum = message.match(/password cannot be longer than (\d+) characters/i);
  if (maximum) return `O serviço de login aceita senhas de até ${maximum[1]} bytes. Acentos e emojis podem ocupar mais de um byte.`;
  if (error.code === 'weak_password') return 'Esta senha não foi aceita pelo serviço de login. Escolha outra senha.';
  return fallback;
}
