export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      aff_articles: {
        Row: {
          category_id: string
          generated_at: string | null
          id: string
          intro_content: string
          is_current: boolean | null
          model_used: string | null
          product_summaries: Json
          seo_description: string
          seo_title: string
        }
        Insert: {
          category_id: string
          generated_at?: string | null
          id?: string
          intro_content: string
          is_current?: boolean | null
          model_used?: string | null
          product_summaries: Json
          seo_description: string
          seo_title: string
        }
        Update: {
          category_id?: string
          generated_at?: string | null
          id?: string
          intro_content?: string
          is_current?: boolean | null
          model_used?: string | null
          product_summaries?: Json
          seo_description?: string
          seo_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "aff_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "aff_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      aff_brand_domains: {
        Row: {
          created_at: string | null
          domain: string
          manufacturer: string
        }
        Insert: {
          created_at?: string | null
          domain: string
          manufacturer: string
        }
        Update: {
          created_at?: string | null
          domain?: string
          manufacturer?: string
        }
        Relationships: []
      }
      aff_categories: {
        Row: {
          created_at: string | null
          id: string
          intro_prompt_context: string
          is_active: boolean | null
          name: string
          pa_api_browse_node: string | null
          pa_api_search_index: string
          parent_category_id: string
          scoring_weights: Json
          search_keywords: string[]
          seo_keywords: string[] | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          intro_prompt_context: string
          is_active?: boolean | null
          name: string
          pa_api_browse_node?: string | null
          pa_api_search_index: string
          parent_category_id: string
          scoring_weights: Json
          search_keywords: string[]
          seo_keywords?: string[] | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          intro_prompt_context?: string
          is_active?: boolean | null
          name?: string
          pa_api_browse_node?: string | null
          pa_api_search_index?: string
          parent_category_id?: string
          scoring_weights?: Json
          search_keywords?: string[]
          seo_keywords?: string[] | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aff_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "aff_parent_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      aff_cron_runs: {
        Row: {
          category_id: string | null
          completed_at: string | null
          content_generated: boolean | null
          duration_ms: number | null
          error_message: string | null
          id: string
          products_fetched: number | null
          products_scored: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          category_id?: string | null
          completed_at?: string | null
          content_generated?: boolean | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          products_fetched?: number | null
          products_scored?: number | null
          started_at?: string | null
          status: string
        }
        Update: {
          category_id?: string | null
          completed_at?: string | null
          content_generated?: boolean | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          products_fetched?: number | null
          products_scored?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "aff_cron_runs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "aff_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      aff_parent_categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      aff_products: {
        Row: {
          affiliate_url: string
          asin: string
          brand_logo_url: string | null
          category_id: string
          detail_page_url: string
          features: string[] | null
          first_seen_at: string | null
          id: string
          image_url: string | null
          image_urls: string[] | null
          is_current: boolean | null
          last_seen_at: string | null
          list_price_cents: number | null
          manufacturer: string | null
          price_cents: number | null
          price_currency: string | null
          rating_count: number | null
          rating_value: number | null
          raw_api_response: Json | null
          sales_rank: number | null
          title: string
        }
        Insert: {
          affiliate_url: string
          asin: string
          brand_logo_url?: string | null
          category_id: string
          detail_page_url: string
          features?: string[] | null
          first_seen_at?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          is_current?: boolean | null
          last_seen_at?: string | null
          list_price_cents?: number | null
          manufacturer?: string | null
          price_cents?: number | null
          price_currency?: string | null
          rating_count?: number | null
          rating_value?: number | null
          raw_api_response?: Json | null
          sales_rank?: number | null
          title: string
        }
        Update: {
          affiliate_url?: string
          asin?: string
          brand_logo_url?: string | null
          category_id?: string
          detail_page_url?: string
          features?: string[] | null
          first_seen_at?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          is_current?: boolean | null
          last_seen_at?: string | null
          list_price_cents?: number | null
          manufacturer?: string | null
          price_cents?: number | null
          price_currency?: string | null
          rating_count?: number | null
          rating_value?: number | null
          raw_api_response?: Json | null
          sales_rank?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "aff_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "aff_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      aff_scores: {
        Row: {
          category_id: string
          composite_score: number
          feature_density_score: number | null
          id: string
          product_id: string
          rank: number
          rating_score: number | null
          recency_score: number | null
          review_volume_score: number | null
          scored_at: string | null
          value_score: number | null
        }
        Insert: {
          category_id: string
          composite_score: number
          feature_density_score?: number | null
          id?: string
          product_id: string
          rank: number
          rating_score?: number | null
          recency_score?: number | null
          review_volume_score?: number | null
          scored_at?: string | null
          value_score?: number | null
        }
        Update: {
          category_id?: string
          composite_score?: number
          feature_density_score?: number | null
          id?: string
          product_id?: string
          rank?: number
          rating_score?: number | null
          recency_score?: number | null
          review_volume_score?: number | null
          scored_at?: string | null
          value_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aff_scores_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "aff_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aff_scores_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "aff_products"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_email: string | null
          author_name: string
          content: string
          created_at: string | null
          id: string
          ip_address: string | null
          project_slug: string
          status: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          author_email?: string | null
          author_name: string
          content: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          project_slug: string
          status?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          author_email?: string | null
          author_name?: string
          content?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          project_slug?: string
          status?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pitch_batters: {
        Row: {
          bats: string | null
          current_team_id: number | null
          debut_year: number | null
          first_name: string | null
          full_name: string
          last_active_year: number | null
          last_name: string | null
          mlb_id: number
          updated_at: string
        }
        Insert: {
          bats?: string | null
          current_team_id?: number | null
          debut_year?: number | null
          first_name?: string | null
          full_name: string
          last_active_year?: number | null
          last_name?: string | null
          mlb_id: number
          updated_at?: string
        }
        Update: {
          bats?: string | null
          current_team_id?: number | null
          debut_year?: number | null
          first_name?: string | null
          full_name?: string
          last_active_year?: number | null
          last_name?: string | null
          mlb_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_batters_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "pitch_teams"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_daily_features: {
        Row: {
          at_bat_number: number
          batter_id: number | null
          computed_at: string
          feature_date: string | null
          feature_kind: string
          game_date: string
          game_pk: number
          pitch_number: number
          pitcher_id: number | null
          reason: string | null
        }
        Insert: {
          at_bat_number: number
          batter_id?: number | null
          computed_at?: string
          feature_date?: string | null
          feature_kind: string
          game_date: string
          game_pk: number
          pitch_number: number
          pitcher_id?: number | null
          reason?: string | null
        }
        Update: {
          at_bat_number?: number
          batter_id?: number | null
          computed_at?: string
          feature_date?: string | null
          feature_kind?: string
          game_date?: string
          game_pk?: number
          pitch_number?: number
          pitcher_id?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pitch_daily_features_game_pk_fkey"
            columns: ["game_pk"]
            isOneToOne: false
            referencedRelation: "pitch_games"
            referencedColumns: ["game_pk"]
          },
          {
            foreignKeyName: "pitch_daily_features_pitcher_id_fkey"
            columns: ["pitcher_id"]
            isOneToOne: false
            referencedRelation: "pitch_pitchers"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_game_pitches: {
        Row: {
          at_bat_number: number
          ax: number | null
          ay: number | null
          az: number | null
          balls: number | null
          batter_id: number | null
          delta_run_exp: number | null
          description: string | null
          events: string | null
          fetched_at: string
          game_pk: number
          inning: number | null
          inning_topbot: string | null
          on_1b: number | null
          on_2b: number | null
          on_3b: number | null
          outs_when_up: number | null
          pfx_x: number | null
          pfx_z: number | null
          pitch_number: number
          pitch_type: string | null
          pitcher_id: number | null
          plate_x: number | null
          plate_z: number | null
          release_extension: number | null
          release_pos_x: number | null
          release_pos_y: number | null
          release_pos_z: number | null
          release_speed: number | null
          release_spin_rate: number | null
          spin_axis: number | null
          stand: string | null
          strikes: number | null
          vx0: number | null
          vy0: number | null
          vz0: number | null
        }
        Insert: {
          at_bat_number: number
          ax?: number | null
          ay?: number | null
          az?: number | null
          balls?: number | null
          batter_id?: number | null
          delta_run_exp?: number | null
          description?: string | null
          events?: string | null
          fetched_at?: string
          game_pk: number
          inning?: number | null
          inning_topbot?: string | null
          on_1b?: number | null
          on_2b?: number | null
          on_3b?: number | null
          outs_when_up?: number | null
          pfx_x?: number | null
          pfx_z?: number | null
          pitch_number: number
          pitch_type?: string | null
          pitcher_id?: number | null
          plate_x?: number | null
          plate_z?: number | null
          release_extension?: number | null
          release_pos_x?: number | null
          release_pos_y?: number | null
          release_pos_z?: number | null
          release_speed?: number | null
          release_spin_rate?: number | null
          spin_axis?: number | null
          stand?: string | null
          strikes?: number | null
          vx0?: number | null
          vy0?: number | null
          vz0?: number | null
        }
        Update: {
          at_bat_number?: number
          ax?: number | null
          ay?: number | null
          az?: number | null
          balls?: number | null
          batter_id?: number | null
          delta_run_exp?: number | null
          description?: string | null
          events?: string | null
          fetched_at?: string
          game_pk?: number
          inning?: number | null
          inning_topbot?: string | null
          on_1b?: number | null
          on_2b?: number | null
          on_3b?: number | null
          outs_when_up?: number | null
          pfx_x?: number | null
          pfx_z?: number | null
          pitch_number?: number
          pitch_type?: string | null
          pitcher_id?: number | null
          plate_x?: number | null
          plate_z?: number | null
          release_extension?: number | null
          release_pos_x?: number | null
          release_pos_y?: number | null
          release_pos_z?: number | null
          release_speed?: number | null
          release_spin_rate?: number | null
          spin_axis?: number | null
          stand?: string | null
          strikes?: number | null
          vx0?: number | null
          vy0?: number | null
          vz0?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pitch_game_pitches_game_pk_fkey"
            columns: ["game_pk"]
            isOneToOne: false
            referencedRelation: "pitch_games"
            referencedColumns: ["game_pk"]
          },
          {
            foreignKeyName: "pitch_game_pitches_pitcher_id_fkey"
            columns: ["pitcher_id"]
            isOneToOne: false
            referencedRelation: "pitch_pitchers"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_games: {
        Row: {
          away_team_id: number | null
          game_date: string
          game_pk: number
          game_type: string | null
          home_team_id: number | null
          season: number
          status: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          away_team_id?: number | null
          game_date: string
          game_pk: number
          game_type?: string | null
          home_team_id?: number | null
          season: number
          status: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          away_team_id?: number | null
          game_date?: string
          game_pk?: number
          game_type?: string | null
          home_team_id?: number | null
          season?: number
          status?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pitch_games_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "pitch_teams"
            referencedColumns: ["mlb_id"]
          },
          {
            foreignKeyName: "pitch_games_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "pitch_teams"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_notable_at_bats: {
        Row: {
          at_bat_number: number
          batter_id: number | null
          computed_at: string
          game_date: string
          game_pk: number
          is_strikeout: boolean
          max_abs_delta_run_exp: number | null
          pitch_count: number
          pitcher_id: number | null
          score: number
          whiff_count: number
        }
        Insert: {
          at_bat_number: number
          batter_id?: number | null
          computed_at?: string
          game_date: string
          game_pk: number
          is_strikeout?: boolean
          max_abs_delta_run_exp?: number | null
          pitch_count: number
          pitcher_id?: number | null
          score: number
          whiff_count?: number
        }
        Update: {
          at_bat_number?: number
          batter_id?: number | null
          computed_at?: string
          game_date?: string
          game_pk?: number
          is_strikeout?: boolean
          max_abs_delta_run_exp?: number | null
          pitch_count?: number
          pitcher_id?: number | null
          score?: number
          whiff_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pitch_notable_at_bats_game_pk_fkey"
            columns: ["game_pk"]
            isOneToOne: false
            referencedRelation: "pitch_games"
            referencedColumns: ["game_pk"]
          },
          {
            foreignKeyName: "pitch_notable_at_bats_pitcher_id_fkey"
            columns: ["pitcher_id"]
            isOneToOne: false
            referencedRelation: "pitch_pitchers"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_pitcher_aggregates: {
        Row: {
          avg_horizontal_break: number | null
          avg_induced_vertical_break: number | null
          avg_late_break_in: number | null
          avg_spin_rate: number | null
          avg_velocity: number | null
          avg_vertical_break: number | null
          batter_hand: string
          batting_avg_against: number | null
          called_strike_rate: number | null
          pitch_count: number | null
          pitch_type: string
          pitcher_id: number
          run_value_per_100: number | null
          season: number
          updated_at: string
          usage_pct: number | null
          whiff_rate: number | null
        }
        Insert: {
          avg_horizontal_break?: number | null
          avg_induced_vertical_break?: number | null
          avg_late_break_in?: number | null
          avg_spin_rate?: number | null
          avg_velocity?: number | null
          avg_vertical_break?: number | null
          batter_hand: string
          batting_avg_against?: number | null
          called_strike_rate?: number | null
          pitch_count?: number | null
          pitch_type: string
          pitcher_id: number
          run_value_per_100?: number | null
          season: number
          updated_at?: string
          usage_pct?: number | null
          whiff_rate?: number | null
        }
        Update: {
          avg_horizontal_break?: number | null
          avg_induced_vertical_break?: number | null
          avg_late_break_in?: number | null
          avg_spin_rate?: number | null
          avg_velocity?: number | null
          avg_vertical_break?: number | null
          batter_hand?: string
          batting_avg_against?: number | null
          called_strike_rate?: number | null
          pitch_count?: number | null
          pitch_type?: string
          pitcher_id?: number
          run_value_per_100?: number | null
          season?: number
          updated_at?: string
          usage_pct?: number | null
          whiff_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pitch_pitcher_aggregates_pitcher_id_fkey"
            columns: ["pitcher_id"]
            isOneToOne: false
            referencedRelation: "pitch_pitchers"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_pitcher_games: {
        Row: {
          fetched_at: string
          game_pk: number
          pitcher_id: number
        }
        Insert: {
          fetched_at?: string
          game_pk: number
          pitcher_id: number
        }
        Update: {
          fetched_at?: string
          game_pk?: number
          pitcher_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pitch_pitcher_games_game_pk_fkey"
            columns: ["game_pk"]
            isOneToOne: false
            referencedRelation: "pitch_games"
            referencedColumns: ["game_pk"]
          },
          {
            foreignKeyName: "pitch_pitcher_games_pitcher_id_fkey"
            columns: ["pitcher_id"]
            isOneToOne: false
            referencedRelation: "pitch_pitchers"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_pitchers: {
        Row: {
          current_team_id: number | null
          debut_year: number | null
          first_name: string | null
          full_name: string
          last_active_year: number | null
          last_name: string | null
          mlb_id: number
          throws: string | null
          updated_at: string
        }
        Insert: {
          current_team_id?: number | null
          debut_year?: number | null
          first_name?: string | null
          full_name: string
          last_active_year?: number | null
          last_name?: string | null
          mlb_id: number
          throws?: string | null
          updated_at?: string
        }
        Update: {
          current_team_id?: number | null
          debut_year?: number | null
          first_name?: string | null
          full_name?: string
          last_active_year?: number | null
          last_name?: string | null
          mlb_id?: number
          throws?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_pitchers_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "pitch_teams"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_rankings: {
        Row: {
          category: string
          computed_at: string
          pitcher_id: number
          pitches_sampled: number
          rank: number
          season: number
          value: number
        }
        Insert: {
          category: string
          computed_at?: string
          pitcher_id: number
          pitches_sampled: number
          rank: number
          season: number
          value: number
        }
        Update: {
          category?: string
          computed_at?: string
          pitcher_id?: number
          pitches_sampled?: number
          rank?: number
          season?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "pitch_rankings_pitcher_id_fkey"
            columns: ["pitcher_id"]
            isOneToOne: false
            referencedRelation: "pitch_pitchers"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_team_rosters: {
        Row: {
          innings_pitched: number | null
          pitcher_id: number
          season: number
          team_id: number
          updated_at: string
        }
        Insert: {
          innings_pitched?: number | null
          pitcher_id: number
          season: number
          team_id: number
          updated_at?: string
        }
        Update: {
          innings_pitched?: number | null
          pitcher_id?: number
          season?: number
          team_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_team_rosters_pitcher_id_fkey"
            columns: ["pitcher_id"]
            isOneToOne: false
            referencedRelation: "pitch_pitchers"
            referencedColumns: ["mlb_id"]
          },
          {
            foreignKeyName: "pitch_team_rosters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "pitch_teams"
            referencedColumns: ["mlb_id"]
          },
        ]
      }
      pitch_teams: {
        Row: {
          abbreviation: string
          division: string
          league: string
          mlb_id: number
          name: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          division: string
          league: string
          mlb_id: number
          name: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          division?: string
          league?: string
          mlb_id?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      seen_jobs: {
        Row: {
          company: string
          created_at: string | null
          id: string
          location: string | null
          search_query: string | null
          source: string | null
          title: string
          url: string | null
        }
        Insert: {
          company: string
          created_at?: string | null
          id: string
          location?: string | null
          search_query?: string | null
          source?: string | null
          title: string
          url?: string | null
        }
        Update: {
          company?: string
          created_at?: string | null
          id?: string
          location?: string | null
          search_query?: string | null
          source?: string | null
          title?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      public_comments: {
        Row: {
          author_name: string | null
          content: string | null
          created_at: string | null
          id: string | null
          project_slug: string | null
        }
        Insert: {
          author_name?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          project_slug?: string | null
        }
        Update: {
          author_name?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          project_slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      aff_to_date: { Args: { ts: string }; Returns: string }
      daitch_mokotoff: { Args: { "": string }; Returns: string[] }
      dmetaphone: { Args: { "": string }; Returns: string }
      dmetaphone_alt: { Args: { "": string }; Returns: string }
      get_next_view_order: { Args: { p_table_id: string }; Returns: number }
      pitch_evict_old_seasons: {
        Args: { p_keep_through: number }
        Returns: {
          aggregates_deleted: number
          pitcher_games_deleted: number
          pitches_deleted: number
        }[]
      }
      pitch_late_break_in: {
        Args: {
          p_ax: number
          p_ay: number
          p_az: number
          p_commit_y?: number
          p_release_pos_y: number
          p_vy0: number
        }
        Returns: number
      }
      pitch_recompute_aggregates: {
        Args: { p_pitcher_id?: number | null; p_season?: number | null }
        Returns: undefined
      }
      pitch_recompute_rankings: {
        Args: { p_season: number }
        Returns: undefined
      }
      pitch_refresh_leaderboards: {
        Args: Record<string, never>
        Returns: undefined
      }
      pitch_top_strikeouts: {
        Args: { p_season: number; p_limit?: number }
        Returns: { rank: number; pitcher_id: number; strikeouts: number }[]
      }
      pitch_top_velocity: {
        Args: { p_days?: number; p_limit?: number; p_min_pitches?: number }
        Returns: {
          rank: number
          pitcher_id: number
          avg_velo: number
          fb_pitches: number
        }[]
      }
      pitch_search_batters: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          bats: string
          current_team_id: number
          debut_year: number
          full_name: string
          last_active_year: number
          match_kind: string
          mlb_id: number
        }[]
      }
      pitch_search_pitchers: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          current_team_id: number
          debut_year: number
          full_name: string
          last_active_year: number
          match_kind: string
          mlb_id: number
          throws: string
        }[]
      }
      reorder_view: {
        Args: { p_new_order: number; p_view_id: string }
        Returns: undefined
      }
      soundex: { Args: { "": string }; Returns: string }
      text_soundex: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
