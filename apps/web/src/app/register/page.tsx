import { pageMetadata } from '@/lib/metadata';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata = pageMetadata('Create account', 'Join ApteeZ to compete and contribute.');

export default function RegisterPage(): React.JSX.Element {
  return <RegisterForm />;
}
