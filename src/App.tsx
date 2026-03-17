/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { MapPin, Navigation, Upload, Search, Map as MapIcon, ExternalLink, Info } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface GasStation {
  id: string | number;
  nome: string;
  cidade: string;
  endereco: string;
  categoria: string;
  lat?: number;
  lng?: number;
  distancia?: number;
}

interface UserLocation {
  lat: number;
  lng: number;
}

export default function App() {
  const [stations, setStations] = useState<GasStation[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [citySearch, setCitySearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get user location on mount
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (err) => {
          console.error("Erro ao obter localização:", err);
          setError("Não foi possível obter sua localização. A ordenação por proximidade pode não funcionar.");
        }
      );
    }
  }, []);

  // Calculate distance using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Use header: 1 to get an array of arrays (rows)
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        if (rows.length < 2) {
          setError("A planilha parece estar vazia ou sem dados.");
          setIsLoading(false);
          return;
        }

        // Identify header indices
        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        const latIdx = headers.findIndex(h => h.includes('lat'));
        const lngIdx = headers.findIndex(h => h.includes('log') || h.includes('lng'));
        const nomeIdx = headers.findIndex(h => h.includes('nome') || h.includes('posto'));

        const parsedStations: GasStation[] = rows.slice(1).map((row, index) => {
          // Column mapping based on user request:
          // B=1 (Categoria), D=3 (Nome Fantasia), F=5, G=6, H=7, I=8 (Endereco), J=9 (Cidade)
          const categoria = String(row[1] || 'Não informado').trim();
          const nome = String(row[3] || 'Sem nome').trim();
          const cidade = String(row[9] || 'Cidade não informada').trim();
          
          // Concatenate address parts from F, G, H, I
          const addressParts = [row[5], row[6], row[7], row[8]]
            .filter(part => part !== undefined && part !== null && String(part).trim() !== '')
            .map(part => String(part).trim());
          
          const endereco = addressParts.length > 0 ? addressParts.join(', ') : 'Endereço não informado';
          
          return {
            id: index,
            nome,
            cidade,
            endereco,
            categoria,
            lat: latIdx !== -1 ? parseFloat(String(row[latIdx])) : undefined,
            lng: lngIdx !== -1 ? parseFloat(String(row[lngIdx])) : undefined,
          };
        });

        setStations(parsedStations.filter(s => s.cidade !== 'Cidade não informada' || s.endereco !== 'Endereço não informado'));
        setIsLoading(false);
      } catch (err) {
        console.error("Erro ao processar arquivo:", err);
        setError("Erro ao processar a planilha. Verifique se o formato está correto.");
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredAndSortedStations = useMemo(() => {
    let result = [...stations];

    // Filter by city search
    if (citySearch.trim() !== '') {
      const searchLower = citySearch.toLowerCase().trim();
      result = result.filter(s => s.cidade.toLowerCase().includes(searchLower));
    }

    // Calculate distances and sort
    if (userLocation) {
      result = result.map(s => {
        if (s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng)) {
          return {
            ...s,
            distancia: calculateDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
          };
        }
        return s;
      });

      result.sort((a, b) => {
        if (a.distancia !== undefined && b.distancia !== undefined) {
          return a.distancia - b.distancia;
        }
        if (a.distancia !== undefined) return -1;
        if (b.distancia !== undefined) return 1;
        return 0;
      });
    }

    return result;
  }, [stations, citySearch, userLocation]);

  const openInGoogleMaps = (address: string, lat?: number, lng?: number) => {
    const query = lat && lng && !isNaN(lat) && !isNaN(lng) ? `${lat},${lng}` : encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  const openInWaze = (address: string, lat?: number, lng?: number) => {
    const query = lat && lng && !isNaN(lat) && !isNaN(lng) ? `${lat},${lng}` : encodeURIComponent(address);
    window.open(`https://waze.com/ul?q=${query}&navigate=yes`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 p-2 rounded-xl">
              <MapPin className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Localizador de Postos</h1>
              <p className="text-xs text-[#9E9E9E]">Encontre o posto mais próximo</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="relative cursor-pointer bg-white border border-black/10 hover:bg-black/5 transition-colors px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-sm">
              <Upload className="w-4 h-4" />
              <span>Subir Planilha</span>
              <input 
                type="file" 
                className="hidden" 
                accept=".xlsx, .xls, .csv" 
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Filters & Status */}
        <section className="mb-8 space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
            <div className="flex flex-col md:flex-row md:items-end gap-6">
              <div className="flex-1 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#9E9E9E] flex items-center gap-2">
                  <Search className="w-3 h-3" />
                  Buscar Cidade
                </label>
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="Digite o nome da cidade..."
                    className="w-full bg-[#F5F5F5] border-none rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                  />
                  <Search className="w-4 h-4 text-[#9E9E9E] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm bg-[#F5F5F5] px-4 py-3 rounded-xl">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  userLocation ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500"
                )} />
                <span className="font-medium">
                  {userLocation ? "Localização Ativa" : "Localização Pendente"}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
              <Info className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
        </section>

        {/* Results List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[#9E9E9E]">
              {filteredAndSortedStations.length} Postos Encontrados
            </h2>
          </div>

          {stations.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-black/5 rounded-3xl py-20 flex flex-col items-center justify-center text-center px-6">
              <div className="bg-[#F5F5F5] p-4 rounded-full mb-4">
                <Upload className="w-8 h-8 text-[#9E9E9E]" />
              </div>
              <h3 className="font-bold text-lg mb-2">Nenhum dado carregado</h3>
              <p className="text-[#9E9E9E] max-w-xs text-sm">
                Faça o upload de uma planilha (Excel ou CSV) com as colunas: Nome, Cidade, Endereço, Latitude e Longitude.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredAndSortedStations.map((station) => (
                <div 
                  key={station.id}
                  className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 hover:border-emerald-500/30 transition-all group"
                >
                  <div className="flex flex-col sm:flex-row justify-between gap-6">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="bg-emerald-50 p-2 rounded-lg group-hover:bg-emerald-100 transition-colors">
                          <MapIcon className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg leading-tight">{station.nome}</h3>
                            <span className={cn(
                              "text-[10px] uppercase tracking-tighter font-bold px-1.5 py-0.5 rounded border",
                              station.categoria.toLowerCase().includes('lavador') 
                                ? "bg-blue-50 text-blue-600 border-blue-200" 
                                : "bg-emerald-50 text-emerald-600 border-emerald-200"
                            )}>
                              {station.categoria}
                            </span>
                          </div>
                          <p className="text-sm text-emerald-600 font-medium">{station.cidade}</p>
                        </div>
                      </div>
                      
                      <div className="pl-10">
                        <p className="text-sm text-[#4A4A4A] leading-relaxed max-w-md">
                          {station.endereco}
                        </p>
                        {station.distancia !== undefined && (
                          <div className="mt-2 flex items-center gap-2 text-xs font-bold text-[#9E9E9E] bg-[#F5F5F5] w-fit px-2 py-1 rounded-md">
                            <Navigation className="w-3 h-3" />
                            {station.distancia.toFixed(1)} km de distância
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:w-48 justify-center">
                      <button 
                        onClick={() => openInGoogleMaps(station.endereco, station.lat, station.lng)}
                        className="flex items-center justify-center gap-2 bg-[#1A1A1A] text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-[#333333] transition-all shadow-lg shadow-black/10"
                      >
                        Google Maps
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => openInWaze(station.endereco, station.lat, station.lng)}
                        className="flex items-center justify-center gap-2 bg-white border border-black/10 px-4 py-3 rounded-xl text-sm font-bold hover:bg-black/5 transition-all"
                      >
                        Waze
                        <Navigation className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer Info */}
      <footer className="max-w-4xl mx-auto px-6 py-12 text-center">
        <p className="text-xs text-[#9E9E9E] uppercase tracking-widest font-bold">
          Localizador de Postos © 2026
        </p>
      </footer>
    </div>
  );
}
