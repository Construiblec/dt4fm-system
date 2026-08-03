export function formatEmployeeName(name: string | null | undefined): string {
  if (!name) return "Sin asignar";
  
  return name
    .split(".")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
