import { Fragment, useMemo, useState } from "react";
import type { InventoryLocation } from "../api";

interface LocationsViewProps {
  locations: InventoryLocation[];
}

function locationLabel(location: string): string {
  return location || "Sin ubicación";
}

export function LocationsView({ locations }: LocationsViewProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const stats = useMemo(() => ({
    components: locations.reduce((sum, entry) => sum + entry.componentCount, 0),
    units: locations.reduce((sum, entry) => sum + entry.totalUnits, 0),
    available: locations.reduce((sum, entry) => sum + entry.availableUnits, 0),
  }), [locations]);

  const filteredLocations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return locations;
    return locations.filter(
      (entry) =>
        locationLabel(entry.location).toLocaleLowerCase().includes(normalizedQuery) ||
        entry.components.some((component) =>
          [component.name, component.category].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ),
        ),
    );
  }, [locations, query]);

  return (
    <>
      <section className="stats">
        <article><span>Ubicaciones</span><strong>{locations.length}</strong></article>
        <article><span>Componentes ubicados</span><strong>{stats.components}</strong></article>
        <article><span>Unidades totales</span><strong>{stats.units}</strong></article>
        <article><span>Disponibles</span><strong>{stats.available}</strong></article>
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Tabla de ubicaciones</h2>
            <span>{filteredLocations.length} de {locations.length} ubicaciones · generada desde el inventario importado</span>
          </div>
        </div>
        <div className="search-bar">
          <label htmlFor="location-search">Buscar ubicación o componente</label>
          <div className="search-controls">
            <input
              id="location-search"
              type="search"
              placeholder="Buscar por ubicación, componente o categoría..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && <button className="secondary" onClick={() => setQuery("")}>Limpiar</button>}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ubicación</th>
                <th>Componentes</th>
                <th>Unidades</th>
                <th>Disponibles</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.map((entry) => {
                const key = entry.location || "__none__";
                const isExpanded = expanded === key;
                return (
                  <Fragment key={key}>
                    <tr>
                      <td><b>{locationLabel(entry.location)}</b></td>
                      <td>{entry.componentCount}</td>
                      <td>{entry.totalUnits}</td>
                      <td><span className={entry.availableUnits <= 2 ? "badge warning" : "badge"}>{entry.availableUnits}</span></td>
                      <td>
                        <button className="secondary" onClick={() => setExpanded(isExpanded ? null : key)}>
                          {isExpanded ? "Ocultar" : "Ver componentes"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td className="location-detail" colSpan={5}>
                          <div className="location-components">
                            {entry.components.map((component) => (
                              <span className="location-chip" key={component.id}>
                                <b>{component.name}</b>
                                <small>{component.category} · {component.available}/{component.quantity} disponibles</small>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!filteredLocations.length && (
            <div className="empty-state">
              <strong>No encontramos ubicaciones</strong>
              <span>{locations.length ? "Prueba con otro término de búsqueda." : "Importa el inventario desde Excel para generar la tabla."}</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
