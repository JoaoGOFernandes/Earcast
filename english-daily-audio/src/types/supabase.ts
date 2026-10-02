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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audio_jobs: {
        Row: {
          attempts: number
          created_at: string
          generation_id: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          generation_id: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          generation_id?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_jobs_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          audio_path: string | null
          created_at: string
          id: string
          new_words: string[] | null
          playlist_id: string
          reviewed: boolean
          status: string
          text_en: string
          text_pt: string
          title: string | null
          user_id: string
          word_timestamps: Json | null
        }
        Insert: {
          audio_path?: string | null
          created_at?: string
          id?: string
          new_words?: string[] | null
          playlist_id: string
          reviewed?: boolean
          status?: string
          text_en: string
          text_pt: string
          title?: string | null
          user_id: string
          word_timestamps?: Json | null
        }
        Update: {
          audio_path?: string | null
          created_at?: string
          id?: string
          new_words?: string[] | null
          playlist_id?: string
          reviewed?: boolean
          status?: string
          text_en?: string
          text_pt?: string
          title?: string | null
          user_id?: string
          word_timestamps?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_configs: {
        Row: {
          complexity: number
          coverage_target: number
          id: string
          playlist_id: string
          theme: string | null
          updated_at: string
          user_id: string
          voice: string
        }
        Insert: {
          complexity?: number
          coverage_target?: number
          id?: string
          playlist_id: string
          theme?: string | null
          updated_at?: string
          user_id: string
          voice?: string
        }
        Update: {
          complexity?: number
          coverage_target?: number
          id?: string
          playlist_id?: string
          theme?: string | null
          updated_at?: string
          user_id?: string
          voice?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_configs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: true
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          archived_at: string | null
          created_at: string
          dominance_score: number | null
          id: string
          is_merged: boolean
          merged_from_ids: string[] | null
          name: string
          source_text_ids: string[]
          status: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          dominance_score?: number | null
          id?: string
          is_merged?: boolean
          merged_from_ids?: string[] | null
          name: string
          source_text_ids: string[]
          status?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          dominance_score?: number | null
          id?: string
          is_merged?: boolean
          merged_from_ids?: string[] | null
          name?: string
          source_text_ids?: string[]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      review_events: {
        Row: {
          generation_id: string
          id: string
          marked_at: string
          mode: string
          phrase: string | null
          playlist_id: string
          user_id: string
          word: string
        }
        Insert: {
          generation_id: string
          id?: string
          marked_at?: string
          mode: string
          phrase?: string | null
          playlist_id: string
          user_id: string
          word: string
        }
        Update: {
          generation_id?: string
          id?: string
          marked_at?: string
          mode?: string
          phrase?: string | null
          playlist_id?: string
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_events_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_events_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      texts: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          daily_generation_hour: number
          relevance_threshold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_generation_hour?: number
          relevance_threshold?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_generation_hour?: number
          relevance_threshold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vocabulary: {
        Row: {
          created_at: string
          id: string
          override_active: boolean | null
          relevance_reason: string | null
          relevance_score: number
          source_text_id: string
          user_id: string
          user_override: boolean
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          override_active?: boolean | null
          relevance_reason?: string | null
          relevance_score: number
          source_text_id: string
          user_id: string
          user_override?: boolean
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          override_active?: boolean | null
          relevance_reason?: string | null
          relevance_score?: number
          source_text_id?: string
          user_id?: string
          user_override?: boolean
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_source_text_id_fkey"
            columns: ["source_text_id"]
            isOneToOne: false
            referencedRelation: "texts"
            referencedColumns: ["id"]
          },
        ]
      }
      word_reviews: {
        Row: {
          created_at: string
          difficulty_count: number
          distinct_playlist_difficulties: string[]
          easiness_factor: number
          id: string
          interval_days: number
          is_global: boolean
          last_reviewed_at: string | null
          next_review_at: string
          playlist_id: string | null
          review_count: number
          updated_at: string
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          difficulty_count?: number
          distinct_playlist_difficulties?: string[]
          easiness_factor?: number
          id?: string
          interval_days?: number
          is_global?: boolean
          last_reviewed_at?: string | null
          next_review_at?: string
          playlist_id?: string | null
          review_count?: number
          updated_at?: string
          user_id: string
          word: string
        }
        Update: {
          created_at?: string
          difficulty_count?: number
          distinct_playlist_difficulties?: string[]
          easiness_factor?: number
          id?: string
          interval_days?: number
          is_global?: boolean
          last_reviewed_at?: string | null
          next_review_at?: string
          playlist_id?: string | null
          review_count?: number
          updated_at?: string
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "word_reviews_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      trigger_daily_generation: { Args: never; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
