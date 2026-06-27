export interface UserPageProps {
  id: string;
}

export default function UserPage({ id }: UserPageProps) {
  return <h1>User {id}</h1>;
}
