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
  public: {
    Tables: {
      case_library: {
        Row: {
          created_at: string
          depth_in: number
          height_in: number
          id: string
          is_global: boolean
          label: string
          max_stack: number
          reference_image_url: string | null
          stackable: boolean
          weight_lb: number
          width_in: number
        }
        Insert: {
          created_at?: string
          depth_in: number
          height_in: number
          id?: string
          is_global?: boolean
          label: string
          max_stack?: number
          reference_image_url?: string | null
          stackable?: boolean
          weight_lb: number
          width_in: number
        }
        Update: {
          created_at?: string
          depth_in?: number
          height_in?: number
          id?: string
          is_global?: boolean
          label?: string
          max_stack?: number
          reference_image_url?: string | null
          stackable?: boolean
          weight_lb?: number
          width_in?: number
        }
        Relationships: []
      }
      custom_trucks: {
        Row: {
          cargo_weight_lb: number
          created_at: string
          cubic_feet: number | null
          has_liftgate: boolean
          id: string
          interior_height_ft: number
          interior_length_ft: number
          interior_width_ft: number
          label: string
          liftgate_lb: number | null
        }
        Insert: {
          cargo_weight_lb: number
          created_at?: string
          cubic_feet?: number | null
          has_liftgate?: boolean
          id?: string
          interior_height_ft: number
          interior_length_ft: number
          interior_width_ft: number
          label: string
          liftgate_lb?: number | null
        }
        Update: {
          cargo_weight_lb?: number
          created_at?: string
          cubic_feet?: number | null
          has_liftgate?: boolean
          id?: string
          interior_height_ft?: number
          interior_length_ft?: number
          interior_width_ft?: number
          label?: string
          liftgate_lb?: number | null
        }
        Relationships: []
      }
      job_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          job_id: string
          label: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: Json
          id?: string
          job_id: string
          label?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          job_id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          client: string | null
          created_at: string
          created_by: string | null
          event_date: string | null
          id: string
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          client?: string | null
          created_at?: string
          created_by?: string | null
          event_date?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          client?: string | null
          created_at?: string
          created_by?: string | null
          event_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_trucks: {
        Row: {
          buffer_pct: number
          created_at: string
          custom_truck_id: string | null
          id: string
          job_id: string
          label: string | null
          sort_order: number
          truck_type: Database["public"]["Enums"]["truck_type"]
        }
        Insert: {
          buffer_pct?: number
          created_at?: string
          custom_truck_id?: string | null
          id?: string
          job_id: string
          label?: string | null
          sort_order?: number
          truck_type?: Database["public"]["Enums"]["truck_type"]
        }
        Update: {
          buffer_pct?: number
          created_at?: string
          custom_truck_id?: string | null
          id?: string
          job_id?: string
          label?: string | null
          sort_order?: number
          truck_type?: Database["public"]["Enums"]["truck_type"]
        }
        Relationships: [
          {
            foreignKeyName: "job_trucks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_trucks_custom_truck_id_fkey"
            columns: ["custom_truck_id"]
            isOneToOne: false
            referencedRelation: "custom_trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      vendor_self_reports: {
        Row: {
          approved_at: string | null
          created_at: string
          id: string
          input_data: Json
          job_id: string
          submitted_at: string | null
          token: string
          vendor_name: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          id?: string
          input_data?: Json
          job_id: string
          submitted_at?: string | null
          token: string
          vendor_name: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          id?: string
          input_data?: Json
          job_id?: string
          submitted_at?: string | null
          token?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_self_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          can_be_base: boolean | null
          created_at: string
          id: string
          input_data: Json
          input_method: Database["public"]["Enums"]["input_method"]
          job_id: string
          job_truck_id: string
          manual_placements: Json
          name: string
          notes: string | null
          sort_order: number
          stackable: boolean | null
          weight_lb_override: number | null
        }
        Insert: {
          can_be_base?: boolean | null
          created_at?: string
          id?: string
          input_data?: Json
          input_method: Database["public"]["Enums"]["input_method"]
          job_id: string
          job_truck_id: string
          manual_placements?: Json
          name: string
          notes?: string | null
          sort_order?: number
          stackable?: boolean | null
          weight_lb_override?: number | null
        }
        Update: {
          can_be_base?: boolean | null
          created_at?: string
          id?: string
          input_data?: Json
          input_method?: Database["public"]["Enums"]["input_method"]
          job_id?: string
          job_truck_id?: string
          manual_placements?: Json
          name?: string
          notes?: string | null
          sort_order?: number
          stackable?: boolean | null
          weight_lb_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_job_truck_id_fkey"
            columns: ["job_truck_id"]
            isOneToOne: false
            referencedRelation: "job_trucks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      input_method:
        | "linear"
        | "dimensions"
        | "pieces"
        | "cubic"
        | "footprint"
        | "pallets"
        | "image"
      job_status: "draft" | "confirmed" | "loaded" | "archived"
      truck_type: "26ft_penske" | "53ft_semi" | "custom"
      user_role: "admin" | "crew"
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
    Enums: {
      input_method: [
        "linear",
        "dimensions",
        "pieces",
        "cubic",
        "footprint",
        "pallets",
        "image",
      ],
      job_status: ["draft", "confirmed", "loaded", "archived"],
      truck_type: ["26ft_penske", "53ft_semi", "custom"],
      user_role: ["admin", "crew"],
    },
  },
} as const
