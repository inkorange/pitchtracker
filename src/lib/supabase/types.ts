export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      pitch_teams: {
        Row: {
          mlb_id: number;
          abbreviation: string;
          name: string;
          division: string;
          league: string;
          updated_at: string;
        };
        Insert: {
          mlb_id: number;
          abbreviation: string;
          name: string;
          division: string;
          league: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pitch_teams"]["Insert"]>;
        Relationships: [];
      };
      pitch_pitchers: {
        Row: {
          mlb_id: number;
          full_name: string;
          first_name: string | null;
          last_name: string | null;
          throws: string | null;
          current_team_id: number | null;
          debut_year: number | null;
          last_active_year: number | null;
          updated_at: string;
        };
        Insert: {
          mlb_id: number;
          full_name: string;
          first_name?: string | null;
          last_name?: string | null;
          throws?: string | null;
          current_team_id?: number | null;
          debut_year?: number | null;
          last_active_year?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pitch_pitchers"]["Insert"]>;
        Relationships: [];
      };
      pitch_team_rosters: {
        Row: {
          team_id: number;
          season: number;
          pitcher_id: number;
          innings_pitched: number | null;
          updated_at: string;
        };
        Insert: {
          team_id: number;
          season: number;
          pitcher_id: number;
          innings_pitched?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pitch_team_rosters"]["Insert"]>;
        Relationships: [];
      };
      pitch_games: {
        Row: {
          game_pk: number;
          game_date: string;
          season: number;
          home_team_id: number | null;
          away_team_id: number | null;
          status: string;
          venue_name: string | null;
          updated_at: string;
        };
        Insert: {
          game_pk: number;
          game_date: string;
          season: number;
          home_team_id?: number | null;
          away_team_id?: number | null;
          status: string;
          venue_name?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pitch_games"]["Insert"]>;
        Relationships: [];
      };
      pitch_game_pitches: {
        Row: {
          game_pk: number;
          at_bat_number: number;
          pitch_number: number;
          pitcher_id: number | null;
          batter_id: number | null;
          pitch_type: string | null;
          pitch_name: string | null;
          description: string | null;
          events: string | null;
          balls: number | null;
          strikes: number | null;
          outs_when_up: number | null;
          inning: number | null;
          inning_topbot: string | null;
          stand: string | null;
          p_throws: string | null;
          on_1b: number | null;
          on_2b: number | null;
          on_3b: number | null;
          release_pos_x: number | null;
          release_pos_y: number | null;
          release_pos_z: number | null;
          vx0: number | null;
          vy0: number | null;
          vz0: number | null;
          ax: number | null;
          ay: number | null;
          az: number | null;
          plate_x: number | null;
          plate_z: number | null;
          release_speed: number | null;
          release_spin_rate: number | null;
          spin_axis: number | null;
          pfx_x: number | null;
          pfx_z: number | null;
          effective_speed: number | null;
          release_extension: number | null;
          delta_run_exp: number | null;
          delta_home_win_exp: number | null;
          fetched_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["pitch_game_pitches"]["Row"], "fetched_at"> & {
          fetched_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pitch_game_pitches"]["Insert"]>;
        Relationships: [];
      };
      pitch_pitcher_aggregates: {
        Row: {
          pitcher_id: number;
          season: number;
          pitch_type: string;
          batter_hand: string;
          pitch_count: number | null;
          usage_pct: number | null;
          avg_velocity: number | null;
          avg_spin_rate: number | null;
          avg_vertical_break: number | null;
          avg_horizontal_break: number | null;
          avg_induced_vertical_break: number | null;
          avg_break_onset_ft: number | null;
          whiff_rate: number | null;
          called_strike_rate: number | null;
          run_value_per_100: number | null;
          batting_avg_against: number | null;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["pitch_pitcher_aggregates"]["Row"], "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pitch_pitcher_aggregates"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      pitch_recompute_aggregates: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
