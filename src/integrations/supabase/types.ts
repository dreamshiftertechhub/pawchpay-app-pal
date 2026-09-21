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
      beneficiaries: {
        Row: {
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          name: string
          recipient_code: string | null
          user_id: string
        }
        Insert: {
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          name: string
          recipient_code?: string | null
          user_id: string
        }
        Update: {
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          name?: string
          recipient_code?: string | null
          user_id?: string
        }
        Relationships: []
      }
      login_codes: {
        Row: {
          code: string
          consumed: boolean
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          consumed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          consumed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          provider: string
          provider_data: Json
          reference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          provider?: string
          provider_data?: Json
          reference: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          provider?: string
          provider_data?: Json
          reference?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      paystack_events: {
        Row: {
          event_key: string
          event_type: string
          id: string
          payload: Json
          processed_at: string
          reference: string | null
        }
        Insert: {
          event_key: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string
          reference?: string | null
        }
        Update: {
          event_key?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string
          reference?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_number: string
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_number: string
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      savings_contributions: {
        Row: {
          amount: number
          created_at: string
          goal_id: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          goal_id: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          goal_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          id: string
          name: string
          saved_amount: number
          status: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          saved_amount?: number
          status?: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          saved_amount?: number
          status?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_security: {
        Row: {
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          direction: string
          id: string
          kind: string
          note: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          direction: string
          id?: string
          kind: string
          note?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          direction?: string
          id?: string
          kind?: string
          note?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      transfer_requests: {
        Row: {
          account_number: string
          amount: number
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          note: string | null
          provider_transfer_code: string | null
          recipient_name: string
          reference: string
          reversed_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number: string
          amount: number
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          note?: string | null
          provider_transfer_code?: string | null
          recipient_name: string
          reference: string
          reversed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string
          amount?: number
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          note?: string | null
          provider_transfer_code?: string | null
          recipient_name?: string
          reference?: string
          reversed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_funding_by_reference: {
        Args: { p_amount: number; p_reference: string }
        Returns: boolean
      }
      fund_savings_goal_for_user: {
        Args: { p_amount: number; p_goal_id: string; p_user_id: string }
        Returns: number
      }
      issue_login_code: { Args: never; Returns: string }
      reserve_transfer_for_user: {
        Args: {
          p_account_number: string
          p_amount: number
          p_bank_code: string
          p_bank_name: string
          p_note?: string
          p_recipient_name: string
          p_reference: string
          p_user_id: string
        }
        Returns: number
      }
      reverse_transfer_by_reference: {
        Args: { p_reason?: string; p_reference: string }
        Returns: undefined
      }
      set_transaction_pin_for_user: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      verify_login_code: { Args: { p_code: string }; Returns: boolean }
      verify_transaction_pin_for_user: {
        Args: { p_pin: string; p_user_id: string }
        Returns: boolean
      }
      wallet_credit: {
        Args: {
          p_amount: number
          p_category: string
          p_kind: string
          p_note?: string
          p_title: string
        }
        Returns: number
      }
      wallet_debit: {
        Args: {
          p_amount: number
          p_category: string
          p_kind: string
          p_note?: string
          p_title: string
        }
        Returns: number
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
