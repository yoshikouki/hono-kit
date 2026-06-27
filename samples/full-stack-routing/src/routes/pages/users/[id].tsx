export interface UserPageProps {
  id: string;
}

export default function Page({ id }: UserPageProps) {
  return <h1>Profile {id}</h1>;
}
